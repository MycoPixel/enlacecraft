export const BondGlyph = {
  single: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <line x1="2" y1="8" x2="26" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  double: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <line x1="2" y1="5" x2="26" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="11" x2="26" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  triple: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <line x1="2" y1="2.5" x2="26" y2="2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="2" y1="8" x2="26" y2="8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="2" y1="13.5" x2="26" y2="13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  wedge: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <polygon points="2,8 26,2.5 26,13.5" fill="currentColor" />
    </svg>
  ),
  dash: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const t = i / 5;
        const w = 2 + t * 8;
        const x = 3 + i * 4.2;
        return <line key={i} x1={x} y1={8 - w / 2} x2={x} y2={8 + w / 2} stroke="currentColor" strokeWidth="2" />;
      })}
    </svg>
  ),
  wavy: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <path d="M 2 8 Q 6 4 10 8 T 18 8 T 26 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  ),
  chain: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <polyline points="2,12 8,4 14,12 20,4 26,12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
