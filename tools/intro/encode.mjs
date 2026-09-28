// Joins the rendered frames and the sound track into the finished film, plus a contact sheet
// (one picture every half second) to check the whole film at a glance.
//   node tools/intro/encode.mjs <framesDir> <sound.wav> <out.mp4> [contact.jpg]
import { execFileSync } from 'node:child_process';
import { FPS } from './cues.mjs';

const FFMPEG = process.env.FFMPEG ?? '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const [frames, wav, out, contact] = process.argv.slice(2);
const run = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

run([
  '-framerate', String(FPS),
  '-i', `${frames}/f%04d.png`,
  '-i', wav,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.CRF ?? '23', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '160k',
  '-af', 'loudnorm=I=-19:TP=-2:LRA=11', '-ar', '48000',
  '-shortest',
  out,
]);
if (contact) {
  run(['-i', out, '-vf', `fps=2,scale=384:-1,tile=8x5:padding=6:margin=6:color=0x1d1a2f`, '-frames:v', '1', '-q:v', '3', contact]);
}
console.log('written', out, contact ?? '');
