import { TICKS_PER_SEC } from '../constants';
import { BotBrain, botProfile } from '../bot';
import { Race } from '../race';
import { courseById } from './courses';

export interface TrackCheck {
  ok: boolean;
  /** Finish time of each bot personality (brave, careful, coin lover, all-rounder); -1 = stuck. */
  times: number[];
  /** Where the slowest stuck bot ended, in tiles from the start (for the editor's hint). */
  stuckAt: number;
}

const LIMIT = 150 * TICKS_PER_SEC;

/**
 * Lets four good bots with different route preferences run the course alone, without the chaos
 * wall. The course is fine when every one of them reaches the finish. Written as a generator that
 * yields its progress (0..1) so the editor can run it in small slices without freezing the screen.
 */
export function* checkTrackSteps(courseId: string, ticksPerSlice = 600): Generator<number, TrackCheck> {
  const course = courseById(courseId);
  const times: number[] = [];
  let stuckAt = -1;
  for (let who = 0; who < 4; who++) {
    const race = new Race({ seed: course.seed, world: course.world, runnerCount: 1, courseId, noWall: true });
    const brain = new BotBrain(course.seed + who * 7919, botProfile('hard', who));
    const r = race.runners[0];
    for (let t = 0; t < LIMIT && r.mode !== 'finished'; t++) {
      race.step([{ ...brain.think(race, 0), use: 0 }]);
      if (t % ticksPerSlice === 0) yield (who + t / LIMIT) / 4;
    }
    times.push(r.finishTime);
    if (r.finishTime < 0) stuckAt = Math.max(stuckAt, Math.round((r.x - race.track.startX) / 40));
  }
  return { ok: times.every((t) => t > 0), times, stuckAt };
}

/** Runs the whole check at once (tests, tools). */
export function checkTrack(courseId: string): TrackCheck {
  const it = checkTrackSteps(courseId, 1e9);
  for (;;) {
    const s = it.next();
    if (s.done) return s.value;
  }
}
