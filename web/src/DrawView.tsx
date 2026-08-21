import { useEffect, useMemo, useState } from "react";
import { loadCategory, loadRelations } from "./data/loaders";
import type { Entry } from "./data/types";
import PickerModal from "./sheet/PickerModal";
import ClassPickerModal from "./sheet/ClassPickerModal";
import EntryCard from "./sheet/EntryCard";
import { LEVELS, xpForLevel } from "./sheet/leveling";
import {
  type AbilityKey, ABILITY_KEYS, ABILITY_LABELS, baseClassName, highestAbilityKey,
  parseRaceAbilities, racialBonus, applyAbilityBonus, buyPointsUsed,
  type Character,
} from "./sheet/character";
import { powerCategory } from "./lib/colors";
import { FilledButton, OutlinedButton, TextButton } from "./components/md";
type Phase = "race" | "class" | "level" | "abilities" | "powers" | "featPrompt" | "feats" | "done";
type DrawCat = "atWill" | "encounter" | "daily" | "utility";
interface DrawStep { type: "power" | "feat" | "boost"; cat?: DrawCat; level: number }

const PHASE_LABEL: Record<Phase, string> = {
  race: "选择种族", class: "选择职业", level: "选择等级", abilities: "分配属性",
  powers: "抽取威能", featPrompt: "是否抽取专长", feats: "抽取专长", done: "完成",
};

interface Props {
  char: Character;
  setChar: (c: Character) => void;
  onExit: () => void;
  onFinish: (c: Character) => void;
}

const CAT_ORDER: DrawCat[] = ["atWill", "encounter", "daily", "utility"];
const BUY_PRESETS: { label: string; values: number[] }[] = [
  { label: "16 16 12 11 11 8", values: [16, 16, 12, 11, 11, 8] },
  { label: "16 16 12 10 10 10", values: [16, 16, 12, 10, 10, 10] },
  { label: "18 14 11 10 10 8", values: [18, 14, 11, 10, 10, 8] },
  { label: "18 12 12 10 10 10", values: [18, 12, 12, 10, 10, 10] },
];
function defaultBuyAbilities(): Record<AbilityKey, number> {
  const low = ABILITY_KEYS[Math.floor(Math.random() * ABILITY_KEYS.length)];
  const a: Record<AbilityKey, number> = { str: 10, con: 10, dex: 10, int: 10, wis: 10, cha: 10 };
  a[low] = 8;
  return a;
}
const CAT_LABEL: Record<DrawCat, string> = { atWill: "随意", encounter: "遭遇", daily: "每日", utility: "辅助" };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function lv(e: Entry): number {
  return parseInt(String(e.level ?? "0"), 10) || 0;
}
function fmtMod(n: number): string {
  return n >= 0 ? "+" + n : String(n);
}

export default function DrawView({ char, setChar, onExit, onFinish }: Props) {
  const [phase, setPhase] = useState<Phase>("race");
  const [races, setRaces] = useState<Entry[]>([]);
  const [classes, setClasses] = useState<Entry[]>([]);
  const [powers, setPowers] = useState<Entry[]>([]);
  const [feats, setFeats] = useState<Entry[]>([]);
  const [relations, setRelations] = useState<{ powerByGrantedBy: Record<string, string[]> }>({ powerByGrantedBy: {} });
  const [raceId, setRaceId] = useState("");
  const [classId, setClassId] = useState("");
  const [maxLevel, setMaxLevel] = useState(1);
  const [abilities, setAbilities] = useState<Record<AbilityKey, number>>(() => defaultBuyAbilities());
  const [raceChoice, setRaceChoice] = useState<AbilityKey | undefined>(undefined);
  const [draws, setDraws] = useState<DrawStep[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [cand, setCand] = useState<Entry[]>([]);
  const [rerolls, setRerolls] = useState(2);
  const [wantFeats, setWantFeats] = useState(false);
  const [slots, setSlots] = useState<Record<DrawCat, string[]>>({ atWill: [], encounter: [], daily: [], utility: [] });
  const [featPicks, setFeatPicks] = useState<string[]>([]);
  const [boostSel, setBoostSel] = useState<AbilityKey[]>([]);

  useEffect(() => {
    void loadCategory("race").then(setRaces).catch(console.error);
    void loadCategory("class").then(setClasses).catch(console.error);
    void loadCategory("power").then(setPowers).catch(console.error);
    void loadCategory("feat").then(setFeats).catch(console.error);
    void loadRelations().then(setRelations).catch(console.error);
  }, []);

  const raceEntry = useMemo(() => races.find((r) => r.id === raceId), [races, raceId]);
  const classEntry = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const raceInfo = useMemo(() => parseRaceAbilities(raceEntry), [raceEntry]);
  const bonus = useMemo(() => racialBonus(raceEntry, raceChoice), [raceEntry, raceChoice]);
  const effectiveAbilities = useMemo(() => applyAbilityBonus(abilities, bonus), [abilities, bonus]);

  const classPowerIds = useMemo(() => {
    if (!classEntry) return null;
    const ids = new Set<string>();
    for (const key of [baseClassName(classEntry.name), classEntry.name, classEntry.id]) {
      for (const id of relations.powerByGrantedBy[key] ?? []) ids.add(id);
    }
    return ids;
  }, [classEntry, relations]);

  function powerDeltas(): DrawStep[] {
    const steps: DrawStep[] = [];
    let prev: Record<DrawCat, number> = { atWill: 0, encounter: 0, daily: 0, utility: 0 };
    for (let l = 1; l <= maxLevel; l++) {
      const cur = LEVELS[l - 1].powers;
      for (const cat of CAT_ORDER) {
        const n = cur[cat] - prev[cat];
        for (let i = 0; i < n; i++) steps.push({ type: "power", cat, level: l });
      }
      // 达到「两个 +1」的等级节点：插入属性提升步（未到最高级时）
      if (l < maxLevel && LEVELS[l - 1].abilityBoost === "两个 +1") {
        steps.push({ type: "boost", level: l });
      }
      prev = cur;
    }
    return steps;
  }

  function rollCandidates(step: DrawStep): Entry[] {
    const pool = step.type === "feat" ? feats : powers;
    const useClass = classPowerIds !== null && classPowerIds.size > 0;
    const base = (p: Entry): boolean => step.type === "feat"
      ? !featPicks.includes(p.id) && !((p.prerequisite ?? "").match(/(\d+)级/) && maxLevel < parseInt((p.prerequisite ?? "").match(/(\d+)级/)![1], 10))
      : powerCategory(p.usage, p.powerKind) === (step.cat === "atWill" ? "at-will" : step.cat) && lv(p) <= step.level && !slots[step.cat!].includes(p.id);
    // 先按职业限定；若无结果则放宽到 分类+等级（避免卡死）
    let ok = pool.filter((p) => base(p) && (!useClass || classPowerIds.has(p.id)));
    if (ok.length === 0) ok = pool.filter(base);
    return shuffle(ok).slice(0, 3);
  }

  function startDraws() {
    const steps = powerDeltas();
    if (steps.length === 0) { setPhase("featPrompt"); return; }
    setDraws(steps);
    setStepIdx(0);
    setRerolls(2);
    setCand(rollCandidates(steps[0]));
    setPhase("powers");
  }

  function startFeats() {
    setWantFeats(true);
    const total = LEVELS[maxLevel - 1].feats;
    const fs: DrawStep[] = [];
    for (let i = 0; i < total; i++) fs.push({ type: "feat", level: maxLevel });
    if (fs.length === 0) { setPhase("done"); return; }
    setDraws(fs);
    setStepIdx(0);
    setRerolls(2);
    setCand(rollCandidates(fs[0]));
    setPhase("feats");
  }

  function advance() {
    if (stepIdx + 1 < draws.length) {
      const ni = stepIdx + 1;
      setStepIdx(ni);
      setRerolls(2);
      setBoostSel([]);
      setCand(rollCandidates(draws[ni]));
    } else if (phase === "powers") {
      setPhase("featPrompt");
    } else {
      setPhase("done");
    }
  }
  function applyBoost() {
    if (boostSel.length !== 2) return;
    setAbilities((a) => {
      const next = { ...a };
      for (const k of boostSel) next[k] = Math.min(30, next[k] + 1);
      return next;
    });
    advance();
  }
  function toggleBoost(k: AbilityKey) {
    setBoostSel((s) => {
      if (s.includes(k)) return s.filter((x) => x !== k);
      if (s.length >= 2) return s;
      return [...s, k];
    });
  }

  function pickCandidate(e: Entry) {
    const step = draws[stepIdx];
    if (step.type === "feat") {
      setFeatPicks((p) => [...p, e.id]);
    } else {
      const cat = step.cat!;
      setSlots((s) => ({ ...s, [cat]: [...s[cat], e.id] }));
    }
    advance();
  }
  function skipStep() {
    advance();
  }
  function reroll() {
    if (rerolls <= 0) return;
    setRerolls((r) => r - 1);
    setCand(rollCandidates(draws[stepIdx]));
  }

  function finish() {
    const topAbility = highestAbilityKey(abilities);
    const c: Character = {
      ...char,
      name: char.name || "未命名角色",
      raceId,
      raceAbility2Choice: raceChoice,
      classId,
      hybrid: false,
      classId2: undefined,
      paragonPathId: undefined,
      epicDestinyId: undefined,
      level: maxLevel,
      xp: String(xpForLevel(maxLevel)),
      abilities,
      combatMods: {
        attacks: char.combatMods.attacks.map((r) => ({ ...r, ability: topAbility })),
        damages: char.combatMods.damages.map((r) => ({ ...r, ability: topAbility })),
      },
      powerSlots: { atWill: slots.atWill, encounter: slots.encounter, daily: slots.daily, utility: slots.utility, special: [] },
      featSlots: featPicks,
    };
    setChar(c);
    onFinish(c);
  }

  // 进度
  const powerStepCount = powerDeltas().length;
  const featStepCount = wantFeats ? LEVELS[Math.max(0, maxLevel - 1)].feats : 0;
  const totalSteps = 4 + powerStepCount + 1 + featStepCount + 1;
  const doneSteps =
    phase === "race" ? 0 :
    phase === "class" ? 1 :
    phase === "level" ? 2 :
    phase === "abilities" ? 3 :
    phase === "powers" ? 4 + stepIdx :
    phase === "featPrompt" ? 4 + powerStepCount :
    phase === "feats" ? 4 + powerStepCount + 1 + stepIdx :
    totalSteps;
  const progress = Math.min(1, doneSteps / Math.max(1, totalSteps));

  const setAb = (k: AbilityKey, d: number) => {
    const v = Math.min(18, Math.max(8, abilities[k] + d));
    if (buyPointsUsed({ ...abilities, [k]: v }) > 22) return;
    setAbilities((a) => ({ ...a, [k]: v }));
  };
  const abLeft = 22 - buyPointsUsed(abilities);

  const step = draws[stepIdx];

  return (
    <div className="draw" key={phase}>
      <div className="draw-head">
        <span className="draw-title">{PHASE_LABEL[phase]}</span>
        <button type="button" className="crop-btn draw-exit" onClick={onExit}>退出抽卡</button>
        {phase === "powers" || phase === "feats" ? (
          <span className="draw-count">第 {stepIdx + 1} / {draws.length} 次</span>
        ) : null}
      </div>
      <div className="draw-bar"><div className="draw-bar-fill" style={{ width: (progress * 100).toFixed(1) + "%" }} /></div>

      {phase === "race" && (
        <PickerModal title="选择种族" entries={races} abilityFilter onSelect={(id) => { setRaceId(id); setPhase("class"); }} onClose={() => {}} />
      )}
      {phase === "class" && (
        <ClassPickerModal entries={classes} hybrid={false} selectedIds={[]} onSelect={(ids) => { if (ids[0]) setClassId(ids[0]); setPhase("level"); }} onClose={() => {}} />
      )}
      {phase === "level" && (
        <div className="draw-body">
          <h3 className="draw-title">选择最高等级（1–10 级）</h3>
          <div className="draw-levels">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((lv) => (
              <button key={lv} type="button" className={"draw-level" + (maxLevel === lv ? " active" : "")} onClick={() => setMaxLevel(lv)}>{lv}</button>
            ))}
          </div>
          <div className="draw-nav">
            <FilledButton onClick={() => setPhase("abilities")}>下一步：分配属性</FilledButton>
          </div>
        </div>
      )}
      {phase === "abilities" && (
        <div className="draw-body">
          <h3 className="draw-title">分配属性（购点法，剩余 {abLeft} 点）</h3>
          {raceInfo && (raceInfo.one || raceInfo.two.length > 0) && (
            <div className="race-bonus-inline">
              {raceInfo.one && <span className="rb-item">+2 {ABILITY_LABELS[raceInfo.one].zh}</span>}
              {raceInfo.two.length > 1 && (
                <span className="rb-choice">
                  <span className="rb-item">+2</span>
                  <select className="rb-select" value={raceChoice ?? raceInfo.two[0]} onChange={(e) => setRaceChoice(e.target.value as AbilityKey)}>
                    {raceInfo.two.map((k) => <option key={k} value={k}>{ABILITY_LABELS[k].zh}</option>)}
                  </select>
                </span>
              )}
            </div>
          )}
          <div className="ability-table draw-ability">
            {ABILITY_KEYS.map((k) => (
              <div className="ability-col" key={k}>
                <div className="ac-head">{ABILITY_LABELS[k].zh} <span className="ac-en">{ABILITY_LABELS[k].en}</span></div>
                <div className="ac-body"><span className="ac-score">{effectiveAbilities[k]}</span><span className="ac-mod">{fmtMod(Math.floor((effectiveAbilities[k] - 10) / 2))}</span></div>
                <div className="ac-step">
                  <button type="button" className="step" disabled={abilities[k] <= 8} onClick={() => setAb(k, -1)}>−</button>
                  <button type="button" className="step" disabled={abilities[k] >= 18 || abLeft <= 0} onClick={() => setAb(k, 1)}>+</button>
                </div>
                {bonus[k] ? <div className="ac-note">基础 {abilities[k]} +2</div> : null}
              </div>
            ))}
          </div>
          <div className="draw-presets-label">快速分配</div>
          <div className="draw-presets">
            {BUY_PRESETS.map((pr) => (
              <button key={pr.label} type="button" className="mode-chip" title="应用该购点组合（按 力/体/敏/智/感/魅 顺序）" onClick={() => setAbilities(({ str: pr.values[0], con: pr.values[1], dex: pr.values[2], int: pr.values[3], wis: pr.values[4], cha: pr.values[5] } as Record<AbilityKey, number>))}>{pr.label}</button>
            ))}
          </div>
          <div className="draw-nav">
            <FilledButton onClick={startDraws}>下一步：抽取威能</FilledButton>
          </div>
        </div>
      )}
      {phase === "powers" && step?.type === "boost" ? (
        <div className="draw-body">
          <h3 className="draw-title">属性提升 <span className="draw-lv">· 达到 {step.level} 级：两个属性 +1</span></h3>
          <p className="hint">选择两个属性各 +1（已选 {boostSel.length}/2）</p>
          <div className="ability-table draw-ability draw-boost">
            {ABILITY_KEYS.map((k) => (
              <button key={k} type="button" className={"draw-boost-item" + (boostSel.includes(k) ? " active" : "")} onClick={() => toggleBoost(k)}>
                <span className="db-name">{ABILITY_LABELS[k].zh}</span>
                <span className="db-val">{effectiveAbilities[k]}{boostSel.includes(k) ? " → " + (effectiveAbilities[k] + 1) : ""}</span>
              </button>
            ))}
          </div>
          <div className="draw-nav">
            <FilledButton disabled={boostSel.length !== 2} onClick={applyBoost}>确认提升并继续</FilledButton>
          </div>
        </div>
      ) : phase === "powers" && (
        <div className="draw-body">
          <h3 className="draw-title">
            抽取{step ? CAT_LABEL[step.cat!] : ""}威能 <span className="draw-lv">· {step ? step.level : ""}级</span>
          </h3>
          <p className="hint">选择一张卡（剩余重roll {rerolls} 次）</p>
          <div className="draw-cards">
            {cand.map((e, i) => (
              <button key={e.id} type="button" className="draw-card" onClick={() => pickCandidate(e)} style={{ animationDelay: (i * 90) + "ms" }}>
                <EntryCard entry={e} />
              </button>
            ))}
            {cand.length === 0 && <p className="hint">没有符合条件的威能。</p>}
          </div>
          <div className="draw-nav">
            <OutlinedButton disabled={rerolls <= 0} onClick={reroll}>重roll（{rerolls}）</OutlinedButton>
            <TextButton onClick={skipStep} title="没有合适的可跳过此步">跳过此项</TextButton>
          </div>
        </div>
      )}
      {phase === "feats" && (
        <div className="draw-body">
          <h3 className="draw-title">抽取专长 <span className="draw-lv">· 第 {stepIdx + 1} / {draws.length} 次</span></h3>
          <p className="hint">选择一张卡（剩余重roll {rerolls} 次）</p>
          <div className="draw-cards">
            {cand.map((e, i) => (
              <button key={e.id} type="button" className="draw-card" onClick={() => pickCandidate(e)} style={{ animationDelay: (i * 90) + "ms" }}>
                <EntryCard entry={e} />
              </button>
            ))}
            {cand.length === 0 && <p className="hint">没有符合条件的专长。</p>}
          </div>
          <div className="draw-nav">
            <OutlinedButton disabled={rerolls <= 0} onClick={reroll}>重roll（{rerolls}）</OutlinedButton>
            <button type="button" className="crop-btn" onClick={skipStep} title="没有合适的可跳过此步">跳过此项</button>
          </div>
        </div>
      )}
      {phase === "featPrompt" && (
        <div className="draw-body">
          <h3 className="draw-title">是否抽取专长？</h3>
          <div className="draw-nav">
            <FilledButton onClick={startFeats}>抽取专长</FilledButton>
            <FilledButton onClick={() => setPhase("done")}>不需要，完成</FilledButton>
          </div>
        </div>
      )}
      {phase === "done" && (
        <div className="draw-body">
          <h3 className="draw-title">抽卡完成！</h3>
          <p className="hint">
            {raceEntry?.name} / {classEntry?.name} · {maxLevel} 级 · 威能 {Object.values(slots).reduce((s, a) => s + a.length, 0)} 个 · 专长 {featPicks.length} 个。
            确认后写入当前人物卡存档。
          </p>
          <div className="draw-nav">
            <FilledButton onClick={finish}>确认写入并返回</FilledButton>
          </div>
        </div>
      )}
    </div>
  );
}
