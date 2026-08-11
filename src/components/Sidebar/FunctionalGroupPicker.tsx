import { FUNCTIONAL_GROUP_TEMPLATES } from "../../model/functionalGroupTemplates";
import { useT } from "../../i18n/useT";

interface FunctionalGroupPickerProps {
  value: string;
  onChange: (id: string) => void;
  active: boolean;
}

/** Condensed-formula badge shown per group (e.g. "COOH", "C=O") — plain
 * text reads faster at this size than a tiny structural drawing would,
 * and every chemist already recognizes these shorthands on sight. Kept as
 * a lookup here rather than on FunctionalGroupTemplate itself since it's
 * purely a picker-label concern, not part of the template's real geometry. */
const BADGE: Record<string, string> = {
  hydroxyl: "OH",
  amine: "NH2",
  thiol: "SH",
  ether: "OR",
  "carboxylic-acid": "COOH",
  ester: "COOR",
  amide: "CONH2",
  ketone: "C=O",
  aldehyde: "CHO",
  nitrile: "C\u2261N",
  nitro: "NO2",
  methyl: "Me",
  ethyl: "Et",
  "n-propyl": "nPr",
  "n-butyl": "nBu",
  isopropyl: "iPr",
  isobutyl: "iBu",
  "sec-butyl": "sBu",
  "tert-butyl": "tBu",
  vinyl: "CH=CH2",
  allyl: "allyl",
  trifluoromethyl: "CF3",
  trichloromethyl: "CCl3",
  azide: "N3",
  acetyl: "Ac",
  pivaloyl: "Piv",
  mesyl: "Ms",
  triflyl: "Tf",
  tms: "TMS",
  tbs: "TBS",
  boc: "Boc",
  phenyl: "Ph",
  benzyl: "Bn",
  cyclohexyl: "Cy",
  benzoyl: "Bz",
  cbz: "Cbz",
  tosyl: "Ts",
};

export function FunctionalGroupPicker({ value, onChange, active }: FunctionalGroupPickerProps) {
  const t = useT();
  return (
    <div className="fgroup-grid">
      {FUNCTIONAL_GROUP_TEMPLATES.map((tmpl) => (
        <button
          key={tmpl.id}
          className={`fgroup-btn ${active && value === tmpl.id ? "fgroup-btn--active" : ""}`}
          onClick={() => onChange(tmpl.id)}
          title={t(`fgroup.${tmpl.id}`)}
        >
          {BADGE[tmpl.id] ?? tmpl.label}
        </button>
      ))}
    </div>
  );
}
