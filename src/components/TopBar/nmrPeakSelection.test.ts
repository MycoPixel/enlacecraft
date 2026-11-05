import { describe, expect, test, beforeEach } from "vitest";
import { groupByEquivalence, equivalenceGroupLabel, type ShiftPrediction, type H1ShiftPrediction } from "../../io/nmrPredict";
import { simulateH1Spectrum, simulateC13Spectrum } from "../../io/nmrSpectrum";
import { useMoleculeStore } from "../../store/useMoleculeStore";

/**
 * Peak -> atom selection.
 *
 * The spectrum labelled every peak with its atoms ("C5, C6") but nothing was
 * clickable, so there was no way to get from a signal back to the structure -
 * the obvious question ("which protons is that multiplet?") meant reading a
 * label and hunting on the canvas by eye.
 *
 * The link the implementation relies on is the group LABEL: a clicked peak
 * carries its label, and the handler finds the equivalence group whose members
 * produce that same label. That's only safe while the label is a faithful,
 * collision-free summary of a group - which is exactly what these tests
 * pin down, because a label collision would silently select the wrong atoms.
 */

/**
 * Mirrors NmrSpectrumView's handleSelectGroup lookup: resolve a group's atom
 * ids from its members' atomIndex via atomOrder, exactly as the component does.
 */
function idsForGroup(
  members: { atomIndex: number }[],
  atomOrder: string[],
): string[] {
  return members.map((m) => atomOrder[m.atomIndex]).filter((id): id is string => Boolean(id));
}

beforeEach(() => {
  useMoleculeStore.setState({ selected: new Set() });
});

describe("peak to atom mapping", () => {
  /** atomOrder maps RDKit's index back to this app's own atom ids. */
  const atomOrder = ["a1", "a2", "a3", "a4"];

  const shift = (atomIndex: number, shiftPpm: number, equivalenceGroup: number): ShiftPrediction => ({
    atomIndex,
    predictedShiftPpm: shiftPpm,
    equivalenceGroup,
  });

  test("a group's atomIndex values resolve through atomOrder to real atom ids", () => {
    // RDKit index 2 is this app's atom a3 - the two orderings differ because
    // SMILES export writes atoms via a DFS spanning tree.
    const group = groupByEquivalence([shift(2, 30.1, 0)])[0];
    expect(idsForGroup(group.members, atomOrder)).toEqual(["a3"]);
  });

  test("selecting a group selects every atom in it", () => {
    // Three equivalent protons in one signal.
    const group = groupByEquivalence([shift(0, 1.2, 7), shift(1, 1.2, 7), shift(3, 1.2, 7)])[0];
    expect(idsForGroup(group.members, atomOrder).sort()).toEqual(["a1", "a2", "a4"]);
  });

  test("different signals stay separate - selecting one never picks another's atoms", () => {
    const groups = groupByEquivalence([shift(0, 1.2, 7), shift(2, 3.4, 8)]);
    const first = groups.find((g) => g.representative.predictedShiftPpm === 1.2)!;
    const second = groups.find((g) => g.representative.predictedShiftPpm === 3.4)!;
    expect(idsForGroup(first.members, atomOrder)).toEqual(["a1"]);
    expect(idsForGroup(second.members, atomOrder)).toEqual(["a3"]);
  });

  test("an atomIndex outside atomOrder is dropped rather than producing a bogus id", () => {
    // A short atomOrder shouldn't yield an id that doesn't exist.
    const group = groupByEquivalence([shift(0, 1.2, 7), shift(99, 1.2, 7)])[0];
    expect(idsForGroup(group.members, ["a1"])).toEqual(["a1"]);
  });

  test("labels are unique per group, so a clicked peak resolves to exactly one group", () => {
    // This is the invariant handleSelectGroup depends on: it looks groups up BY
    // LABEL. If two groups could share a label, a click would silently select
    // the wrong atoms - a wrong answer rather than a missing feature.
    const atomLabels = new Map([
      ["a1", "H1"],
      ["a2", "H2"],
      ["a3", "H3"],
    ]);
    const groups = groupByEquivalence([shift(0, 1.2, 7), shift(1, 1.2, 7), shift(2, 3.4, 8)]);
    const labels = groups.map((g) => equivalenceGroupLabel(g.members, atomOrder, atomLabels));
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("a group whose members have no label falls back to the raw index", () => {
    // Not a crash, and still unique per group - the fallback is what keeps the
    // label-based lookup total.
    const labels = groupByEquivalence([shift(0, 1.2, 7), shift(1, 3.4, 8)]).map((g) =>
      equivalenceGroupLabel(g.members, atomOrder, new Map()),
    );
    expect(labels).toEqual(["0", "1"]);
  });

  test("the simulated peak's label is the same string the lookup matches on", () => {
    // The end-to-end link: the label rendered on the plot and the label used to
    // find the group must be produced by the same call, or the click resolves
    // to nothing.
    const atomLabels = new Map([["a1", "H1"], ["a2", "H2"]]);
    const groups = groupByEquivalence([shift(0, 1.2, 7), shift(1, 3.4, 8)]);
    const peaks = simulateC13Spectrum(groups, (g) => equivalenceGroupLabel(g.members, atomOrder, atomLabels));
    for (const peak of peaks) {
      const matched = groups.find(
        (g) => equivalenceGroupLabel(g.members, atomOrder, atomLabels) === peak.label,
      );
      expect(matched).toBeDefined();
    }
  });

  test("selecting replaces the previous selection rather than adding to it", () => {
    // A click on a peak is a statement about that signal. Leaving an earlier
    // selection in place would mean a following drag moves atoms the user
    // wasn't looking at.
    useMoleculeStore.setState({ selected: new Set(["a4"]) });
    const group = groupByEquivalence([shift(0, 1.2, 7)])[0];
    useMoleculeStore.getState().setSelected(new Set(idsForGroup(group.members, atomOrder)));
    expect([...useMoleculeStore.getState().selected]).toEqual(["a1"]);
  });
});

describe("1H peak groups carry the same grouping", () => {
  const atomOrder = ["a1", "a2", "a3"];

  const h1 = (atomIndex: number, shiftPpm: number, equivalenceGroup: number, multiplicity = "s"): H1ShiftPrediction => ({
    atomIndex,
    predictedShiftPpm: shiftPpm,
    numHs: 3,
    multiplicity,
    // Tier 1 (no real coupling estimate) - the same shape the API returns
    // when it only has a topological count, and the case that makes the
    // spectrum's splitting "illustrative".
    multiplicityDetail: "",
    couplingHz: [],
    equivalenceGroup,
  });

  test("an H1 group's label round-trips to its atoms", () => {
    const atomLabels = new Map([["a1", "H1"], ["a2", "H2"], ["a3", "H3"]]);
    const groups = groupByEquivalence([h1(0, 3.7, 1), h1(1, 1.2, 2), h1(2, 4.1, 3)]);
    const peaks = simulateH1Spectrum(groups, (g) => equivalenceGroupLabel(g.members, atomOrder, atomLabels));
    expect(peaks).toHaveLength(3);

    const target = peaks.find((p) => p.label === "H2")!;
    const matched = groups.find((g) => equivalenceGroupLabel(g.members, atomOrder, atomLabels) === target.label)!;
    expect(idsForGroup(matched.members, atomOrder)).toEqual(["a2"]);
  });
});