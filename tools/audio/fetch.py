#!/usr/bin/env python3
"""
Downloads finished ElevenLabs generations (sounds and voice lines) and prepares them for the game.

The download links are read from this Claude session's transcript (they expire after two hours):
every finished run lists its "media" with prompt, voice and url. Each job in tools/audio/jobs.json
is matched by its prompt (and voice), downloaded and processed with ffmpeg:
  - silence at the start and end is cut,
  - voice lines are played 20 % faster (same pitch) so they fit the hectic races,
  - loudness is evened out, mono, small mp3.
Results go to public/assets/audio/<path>; src/audio/clips.json lists what exists.

Usage: python3 tools/audio/fetch.py [transcript.jsonl]
       python3 tools/audio/fetch.py --test OUTDIR   (only the voice tests, into OUTDIR)
"""
import glob
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
OUT = os.path.join(ROOT, 'public', 'assets', 'audio')
VOICE_TEMPO = 1.2


def transcript_media(path):
    """All finished media entries found in the transcript, newest last."""
    found = []

    def walk(v):
        if isinstance(v, str):
            if '"media"' in v and '"generation_id"' in v:
                try:
                    data = json.loads(v)
                except ValueError:
                    return
                for m in data.get('media', []):
                    found.append(m)
        elif isinstance(v, list):
            for x in v:
                walk(x)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)

    with open(path) as f:
        for line in f:
            try:
                walk(json.loads(line))
            except ValueError:
                pass
    # big tool results are stored next to the transcript as separate files
    results = os.path.join(os.path.dirname(path), os.path.basename(path)[:-6], 'tool-results')
    for name in sorted(glob.glob(os.path.join(results, '*ElevenLabs*'))):
        walk(open(name).read())
    return found


def process(src, dst, voice):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,' \
           'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse'
    chain = [trim]
    if voice:
        chain.append(f'atempo={VOICE_TEMPO}')
    chain.append('loudnorm=I=-15:TP=-1.5:LRA=11')
    def run(filters):
        return subprocess.run(
            [FFMPEG, '-y', '-loglevel', 'error', '-i', src, '-af', ','.join(filters), '-ac', '1', '-ar', '44100',
             '-b:a', '64k' if voice else '80k', dst],
        ).returncode == 0

    # some clips trip ffmpeg's silence filter: then keep them untrimmed
    if not run(chain):
        run(chain[1:])


def speech_islands(src, n):
    """Start/end (s) of the n spoken lines: loud runs of the envelope, merged across short breaths."""
    raw = subprocess.run([FFMPEG, '-v', 'error', '-i', src, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'],
                         capture_output=True).stdout
    samples = memoryview(raw).cast('h')
    win = 160  # 20 ms
    env = []
    for i in range(0, len(samples) - win, win):
        chunk = samples[i:i + win]
        env.append((sum(v * v for v in chunk) / win) ** 0.5)
    peak = max(env) or 1
    for drop_db in (35, 30, 25, 20, 40, 45):
        thr = peak * 10 ** (-drop_db / 20)
        runs, start = [], None
        for k, e in enumerate(env + [0]):
            if e > thr and start is None:
                start = k
            elif e <= thr and start is not None:
                runs.append([start, k])
                start = None
        # a breath inside a line is short: glue runs closer than 100 ms, drop clicks under 60 ms
        merged = []
        for r in runs:
            if merged and r[0] - merged[-1][1] < 5:
                merged[-1][1] = r[1]
            else:
                merged.append(r)
        merged = [r for r in merged if r[1] - r[0] >= 3]
        # too many: glue the pairs with the smallest gaps
        while len(merged) > n:
            k = min(range(len(merged) - 1), key=lambda j: merged[j + 1][0] - merged[j][1])
            merged[k][1] = merged[k + 1][1]
            del merged[k + 1]
        if len(merged) == n:
            return [(a * 0.02, b * 0.02) for a, b in merged]
    return None


def split_batch(src, files, texts):
    """Cuts one recording with len(files) lines into its spoken lines."""
    islands = speech_islands(src, len(files))
    if islands:
        for i, f in enumerate(files):
            start = max(0.0, islands[i][0] - 0.06)
            end = islands[i][1] + 0.12
            with tempfile.NamedTemporaryFile(suffix='.wav') as part:
                subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', src, '-ss', str(start), '-to', str(end), part.name],
                               check=True)
                process(part.name, os.path.join(OUT, f), True)
        return
    split_batch_by_pauses(src, files, texts)


def split_batch_by_pauses(src, files, texts):
    """Cuts one recording with len(files) lines at its len(files)-1 longest pauses."""
    def gaps_for(noise, dur):
        log = subprocess.run(
            [FFMPEG, '-i', src, '-af', f'silencedetect=noise={noise}dB:d={dur}', '-f', 'null', '-'],
            capture_output=True, text=True,
        ).stderr
        starts = [float(l.split('silence_start: ')[1].split()[0]) for l in log.splitlines() if 'silence_start: ' in l]
        ends = [float(l.split('silence_end: ')[1].split()[0]) for l in log.splitlines() if 'silence_end: ' in l]
        total = 1e9
        if 'Duration: ' in log:
            h, mi, se = log.split('Duration: ')[1].split(',')[0].split(':')
            total = int(h) * 3600 + int(mi) * 60 + float(se)
        return [(e - s_, (s_ + e) / 2) for s_, e in zip(starts, ends) if s_ > 0.05 and (s_ + e) / 2 < total - 0.1]

    # candidate pauses: generous detection, then pick the cuts whose pieces best match the
    # expected line lengths (a line can contain a pause of its own, e.g. "Ich sehe … Sternchen")
    gaps = []
    for noise in (-40, -35, -30, -26, -22, -18):
        gaps = gaps_for(noise, 0.12)
        if len(gaps) >= len(files) - 1:
            break
    if len(gaps) < len(files) - 1:
        print('  could not split: found', len(gaps) + 1, 'parts for', len(files), 'lines')
        return
    gaps.sort(key=lambda g: g[1])
    total = gaps[-1][1] + 2.0
    weights = [max(4, len(t)) for t in texts]
    per_char = total / sum(weights)
    n, c = len(files), len(gaps)
    INF = float('inf')
    # best[k][j]: cost when cut k (0-based) is placed at gap j
    best = [[INF] * c for _ in range(n - 1)]
    prev = [[-1] * c for _ in range(n - 1)]

    def seg_cost(start, end, i):
        return abs((end - start) - weights[i] * per_char) - 0.8 * 0

    for j in range(c):
        best[0][j] = seg_cost(0, gaps[j][1], 0) - 6.0 * gaps[j][0]
    for k in range(1, n - 1):
        for j in range(k, c):
            for q in range(k - 1, j):
                v = best[k - 1][q] + seg_cost(gaps[q][1], gaps[j][1], k) - 6.0 * gaps[j][0]
                if v < best[k][j]:
                    best[k][j], prev[k][j] = v, q
    end_j = min(range(c), key=lambda j: best[n - 2][j] + seg_cost(gaps[j][1], total, n - 1))
    idx = [end_j]
    for k in range(n - 2, 0, -1):
        idx.append(prev[k][idx[-1]])
    cuts = [gaps[j][1] for j in reversed(idx)]
    bounds = [0.0] + cuts + [None]
    for i, f in enumerate(files):
        with tempfile.NamedTemporaryFile(suffix='.wav') as part:
            cmd = [FFMPEG, '-y', '-loglevel', 'error', '-i', src, '-ss', str(bounds[i])]
            if bounds[i + 1] is not None:
                cmd += ['-to', str(bounds[i + 1])]
            subprocess.run(cmd + [part.name], check=True)
            process(part.name, os.path.join(OUT, f), True)


def split_music(src, worlds):
    log = subprocess.run([FFMPEG, '-i', src], capture_output=True, text=True).stderr
    h, mi, se = log.split('Duration: ')[1].split(',')[0].split(':')
    total = int(h) * 3600 + int(mi) * 60 + float(se)
    part = total / len(worlds)
    os.makedirs(os.path.join(OUT, 'music'), exist_ok=True)
    for i, w in enumerate(worlds):
        start, length = i * part, part - 0.9  # skip the short break at the end of each section
        subprocess.run(
            [FFMPEG, '-y', '-loglevel', 'error', '-ss', str(start), '-t', str(length), '-i', src,
             '-af', f'afade=t=in:d=0.25,afade=t=out:st={length - 0.6}:d=0.6,loudnorm=I=-16:TP=-1.5',
             '-ac', '2', '-ar', '44100', '-b:a', '96k', os.path.join(OUT, 'music', w + '.mp3')],
            check=True,
        )


def newest_transcript():
    files = glob.glob('/root/.claude/projects/-home-user-Handygame/*.jsonl')
    return max(files, key=os.path.getmtime)


def main():
    args = sys.argv[1:]
    test_dir = None
    if args and args[0] == '--test':
        test_dir = args[1]
        args = args[2:]
    media = transcript_media(args[0] if args else newest_transcript())
    # key: prompt + voice id (sound effects have no voice)
    by_key = {}
    for m in media:
        by_key[(m.get('prompt'), (m.get('voice') or {}).get('voice_id'))] = m

    if test_dir:
        os.makedirs(test_dir, exist_ok=True)
        for (prompt, voice), m in by_key.items():
            if not voice:
                continue
            name = (m['voice']['name'].split(' ')[0] + '-' + prompt.split(']')[-1].strip()[:24]).replace(' ', '_')
            name = ''.join(c for c in name if c.isalnum() or c in '-_') + '.mp3'
            with tempfile.NamedTemporaryFile(suffix='.mp3') as tmp:
                urllib.request.urlretrieve(m['url'], tmp.name)
                process(tmp.name, os.path.join(test_dir, name), True)
            print('test', name)
        return

    jobs = json.load(open(os.path.join(ROOT, 'tools', 'audio', 'jobs.json')))
    done, missing = 0, []
    for path, job in jobs.items():
        dst = os.path.join(OUT, path)
        if os.path.exists(dst):
            done += 1
            continue
        m = by_key.get((job['prompt'], job.get('voice')))
        if not m:
            missing.append(path)
            continue
        with tempfile.NamedTemporaryFile(suffix='.mp3') as tmp:
            try:
                urllib.request.urlretrieve(m['url'], tmp.name)
            except Exception as e:  # link expired: generate again
                print('download failed', path, e)
                missing.append(path)
                continue
            process(tmp.name, dst, job['type'] == 'tts')
        done += 1
    # batched recordings: one take with many lines, cut at the longest pauses
    batches_path = os.path.join(ROOT, 'tools', 'audio', 'batches.json')
    if os.path.exists(batches_path):
        for name, b in json.load(open(batches_path)).items():
            todo = [f for f in b['files'] if not os.path.exists(os.path.join(OUT, f))]
            if not todo:
                continue
            m = by_key.get((b['prompt'], b['voice']))
            if not m:
                print('batch not ready', name)
                continue
            with tempfile.NamedTemporaryFile(suffix='.mp3') as tmp:
                urllib.request.urlretrieve(m['url'], tmp.name)
                split_batch(tmp.name, b['files'], b.get('texts') or [''] * len(b['files']))
            print('batch split', name, len(b['files']))
    # music: one composition with a section per world, cut into equal parts
    music_path = os.path.join(ROOT, 'tools', 'audio', 'music.json')
    if os.path.exists(music_path):
        mj = json.load(open(music_path))
        todo = [w for w in mj['worlds'] if not os.path.exists(os.path.join(OUT, 'music', w + '.mp3'))]
        m = by_key.get((mj['prompt'], None))
        if todo and m:
            with tempfile.NamedTemporaryFile(suffix='.mp3') as tmp:
                urllib.request.urlretrieve(m['url'], tmp.name)
                split_music(tmp.name, mj['worlds'])
            print('music split', len(mj['worlds']))
        elif todo:
            print('music not ready')
    # list of the clips that exist, for the game
    clips = sorted(
        os.path.relpath(os.path.join(d, f), OUT)[:-4]
        for d, _, fs in os.walk(OUT) for f in fs if f.endswith('.mp3')
    )
    json.dump(clips, open(os.path.join(ROOT, 'src', 'audio', 'clips.json'), 'w'), indent=0)
    print(f'{done} ready, {len(missing)} missing')
    for p in missing[:400]:
        print('  missing', p)


if __name__ == '__main__':
    main()
