// How well an exhibit suits a species: one meter per need (0 to 1) and an overall score.
import { SPECIES, FENCES, BIOMES } from "./data.js";
import { fenceId } from "./grid.js";

// Which sea water a sea exhibit's walls can hold: "deep" if every wall is lagoon, "shallow" if every wall holds sea water.
export function seaHeld(state, t) {
  if (t.biome !== "sea" || !t.fences.length) return null;
  const holds = t.fences.map(f => FENCES[fenceId(state.grid, f)]?.holds || null);
  if (holds.every(h => h === "deep")) return "deep";
  if (holds.every(h => h)) return "shallow";
  return null;
}

export function habitatScore(state, sp, t, count) {
  const s = SPECIES[sp], out = {};
  const pref = s.biomes.indexOf(t.biome);
  out.biome = pref === 0 ? 1 : pref > 0 ? 0.7 : 0.2;
  const room = t.land + t.shallow + t.deep;
  out.space = Math.min(1, room / Math.max(1, s.space * Math.max(1, count)));
  const wet = room ? (t.shallow + t.deep) / room : 0;
  if (s.sea) {
    const held = seaHeld(state, t), deepOk = held === "deep", shallowOk = held === "shallow" || deepOk;
    const usable = s.waterKind === "deep" ? (deepOk ? t.deep : 0) : (shallowOk ? t.shallow + t.deep : 0);
    out.water = room ? Math.min(1, usable / room / s.water) : 0;
  } else {
    out.water = s.water ? Math.min(1, wet / s.water) : 1 - Math.max(0, wet - 0.5);   // land animals mind a pen that's mostly water
  }
  out.group = count < s.group[0] ? count / s.group[0] : count > s.group[1] ? s.group[1] / count : 1;
  out.overall = (out.biome + out.space + out.water + out.group) / 4;
  return out;
}

// Sea species live only in sea exhibits, and nothing else goes in one. "" when the species fits that biome.
export function fitProblem(sp, biome) {
  const sea = !!SPECIES[sp].sea;
  if (sea === !!BIOMES[biome]?.sea) return "";
  return sea ? "Needs a sea exhibit." : "Not a sea animal.";
}
