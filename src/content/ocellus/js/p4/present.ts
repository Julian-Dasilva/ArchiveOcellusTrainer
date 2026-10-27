import { Sound, SoundCache, cacheSound } from "osrs-sdk";
import { OCELLUS_P4 } from "../OcellusTimings";
import type { SoundId } from "../../../../sim/brands";
import type { Frame, RoomTile } from "../../../../sim/frame";
import { toRoom } from "../../../../sim/frame";
import type { FightEvent, PlayerHitSource, TickRow, VoidKind } from "../P4Types";
import type { ExplosionViews } from "../entities/ExplosionViews";
import type { BossLook, FloorHole, FragmentFlash, OrbView, PlayerLook, VoidField } from "../entities/P4Views";
import { voidUnder } from "./floor";

export type Views = Readonly<{
  field: VoidField;
  holes: readonly FloorHole[];
  orbs: Readonly<Record<VoidKind, OrbView>>;
  fragment: FragmentFlash;
  explosions: ExplosionViews;
  boss: BossLook;
  player: PlayerLook;
  chat: string[];
}>;

const { sounds, soundPlayback } = OCELLUS_P4.presentation;

const LETHAL_HIT: Readonly<Record<PlayerHitSource, string>> = {
  "deflect-reflected": "a deflected hit's reflection",
  "floor-hit": "the void floor",
  "hole-hit": "a floor hole",
  "void-hit": "a phase 3 void",
  "lifeforce-drained": "the lifeforce steal",
  "explosion-resolved": "an explosion",
  "special-hit": "a transition attack",
  "rift-burst": "a void rift burst",
};

function playCue(id: SoundId, at: RoomTile, delayMs = 0): void {
  const { volume, range, retain } = soundPlayback.value;
  SoundCache.play(new Sound(cacheSound(id), volume, delayMs, { location: at, range, retain }));
}

function present(event: FightEvent, views: Views, frame: Frame, player: RoomTile): void {
  switch (event.kind) {
    case "lifeforce-told":
      views.fragment.tell(player);
      views.chat.push(OCELLUS_P4.lifeforce.tellChat.value);
      return;
    case "orb-spawned":
      views.orbs[event.void].spawn(event.void, toRoom(frame, event.tile));
      return;
    case "orb-matured":
      views.orbs[event.void].mature();
      return;
    case "orb-returned":
      views.orbs[event.void].leave();
      views.fragment.regain(player);
      playCue(sounds.orbReturn.value, player);
      return;
    case "orb-expired":
      views.orbs[event.void].leave();
      return;
    case "explosion-series-started":
      views.player.explosionsWarned();
      playCue(sounds.explosionSeriesStart.value, player);
      return;
    case "explosion-marked":
      views.explosions.mark(event.void, event.pulse, toRoom(frame, event.tile));
      playCue(sounds.explosionMark.value, player);
      return;
    case "explosion-resolved":
      views.explosions.detonate(event.void, event.pulse);
      return;
    case "stage-entered":
      views.boss.enter(event.stage);
      if (event.stage === "outer-void") playCue(sounds.flood.value, player);
      return;
    case "special-told":
      views.boss.tell(event.variant);
      return;
    case "special-sounded":
      playCue(sounds[event.cue.sound].value, player, event.cue.delayMs);
      return;
    case "boss-shouted":
      playCue(sounds.endShout.value, player);
      return;
    case "boss-landing-started":
      views.boss.land();
      return;
    case "rift-destroyed":
      views.chat.push(OCELLUS_P4.rifts.killChat.value);
      return;
    case "rift-burst":
      views.player.riftBurst();
      return;
    case "death-prevented":
      views.chat.push(`Invincible: ${LETHAL_HIT[event.source]} would have killed you on tick ${event.at}.`);
      return;
    case "run-ended":
      views.explosions.retire();
      if (event.reason === "kill") views.boss.die();
      return;
    case "lifeforce-drained":
      views.boss.drained(event.void);
      return;
    case "player-hit-judged":
      if (event.outcome === "blocked") views.player.deflected();
      return;
    case "overhead-switched":
    case "boss-state-changed":
    case "deflect-reflected":
    case "floor-hit":
    case "hole-hit":
    case "void-hit":
    case "boss-healed":
    case "special-hit":
    case "rift-spawned":
    case "rift-hit":
      return;
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

export function presentRow(row: TickRow, views: Views, frame: Frame): void {
  const floor = voidUnder(row.phase);
  views.field.show(floor);
  views.holes.forEach((hole) => hole.cover(floor));
  const player = toRoom(frame, row.playerAtPostTick.tile);
  row.events.forEach((event) => present(event, views, frame, player));
}
