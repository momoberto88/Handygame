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
