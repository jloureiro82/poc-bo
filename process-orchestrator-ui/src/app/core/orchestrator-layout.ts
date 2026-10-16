import { DagAnalysis, analyzeDag } from './dag';
import { isObject, pathToString } from './json-path';

/**
 * Computes a left-to-right layout of an orchestrator configuration: steps are columns ordered by their
 * `previousStep` depth, and inside each step the activities flow top-to-bottom by `previousActivity` depth.
 * Pure geometry, so it can be unit tested and rendered as plain SVG.
 */

export const ACTIVITY_W = 196;
export const ACTIVITY_H = 76;
const ACTIVITY_GAP_X = 20;
const ACTIVITY_GAP_Y = 40;
const STEP_PAD = 16;
const STEP_HEADER = 48;
const STEP_GAP_X = 88;
const STEP_GAP_Y = 36;
const MARGIN = 28;
const START_SPACE = 44;
const ROW_GAP = 64;
/** Space for routed connectors: padding around a lane group, and distance between parallel lanes. */
const LANE_PAD = 18;
const LANE_STEP = 12;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ActivityNode extends Box {
  path: string;
  index: number;
  label: string;
  workflowLabel: string;
  automatic: boolean;
  sync: boolean;
  entry: boolean;
  onFailure: string | null;
  cancellation: string | null;
  condition: string | null;
  /** Labels of the activities this one runs after, when there is more than one (any of them triggers it). */
  after: string[] | null;
}

interface ActivityLink {
  p: number;
  c: number;
  skip: boolean;
  lane: number;
  broken: boolean;
}

export interface StepNode extends Box {
  path: string;
  index: number;
  label: string;
  automatic: boolean;
  sync: boolean;
  entry: boolean;
  /** Labels of the steps this one runs after, when there is more than one (it starts after any of them). */
  after: string[] | null;
  activities: ActivityNode[];
}

export interface Edge {
  d: string;
  /** Edge ends where the referenced label is missing, or closes a cycle. */
  broken: boolean;
  /** Paths of the nodes it links (`from` runs before `to`); empty for the flow-start arrow. */
  from: string;
  to: string;
}

export interface OrchestratorLayout {
  width: number;
  height: number;
  steps: StepNode[];
  stepEdges: Edge[];
  activityEdges: Edge[];
  start: { x: number; y: number } | null;
}

/**
 * @param maxWidth when the step columns would be wider than this, they wrap onto further rows (read left to right,
 *                 top to bottom) so long flows stay readable instead of becoming one very wide strip.
 */
export function layoutOrchestrator(config: unknown, maxWidth = Infinity): OrchestratorLayout {
  const empty: OrchestratorLayout = { width: 320, height: 160, steps: [], stepEdges: [], activityEdges: [], start: null };
  if (!isObject(config) || !Array.isArray(config['stepList'])) {
    return empty;
  }
  const rawSteps = config['stepList'].map(s => (isObject(s) ? s : {}));
  if (rawSteps.length === 0) {
    return empty;
  }

  const stepDag = analyzeDag(rawSteps.map(s => ({ label: s['label'] as string | undefined, previous: s['previousStep'] })));

  // 1. Size every step from its own activity layout.
  const activityDags: DagAnalysis[] = [];
  const activityLinks: ActivityLink[][] = [];
  const steps: StepNode[] = rawSteps.map((step, si) => {
    const rawActivities = Array.isArray(step['activityList']) ? step['activityList'].map(a => (isObject(a) ? a : {})) : [];
    const actDag = analyzeDag(
      rawActivities.map(a => ({ label: a['label'] as string | undefined, previous: a['previousActivity'] })),
    );
    activityDags.push(actDag);
    const rows: number[][] = [];
    actDag.depth.forEach((d, ai) => (rows[d] ??= []).push(ai));
    const denseRows = rows.filter(r => r && r.length);
    const rowIndex: number[] = [];
    denseRows.forEach((row, r) => row.forEach(ai => (rowIndex[ai] = r)));

    // Links to the next row go straight down; links that skip rows (or go back up) use a lane on the step's right
    // side, so they never pass through the activities in between.
    const links: ActivityLink[] = [];
    actDag.parents.forEach((parents, c) =>
      parents.forEach(p =>
        links.push({ p, c, skip: rowIndex[c] !== rowIndex[p] + 1, lane: 0, broken: actDag.inCycle.has(c) && actDag.inCycle.has(p) }),
      ),
    );
    const skips = links.filter(l => l.skip).sort((a, b) => rowIndex[b.c] - rowIndex[b.p] - (rowIndex[a.c] - rowIndex[a.p]));
    skips.forEach((l, k) => (l.lane = k));
    activityLinks.push(links);
    const laneSpace = skips.length ? LANE_PAD + skips.length * LANE_STEP : 0;

    const widest = Math.max(1, ...denseRows.map(r => r.length));
    const innerW = widest * ACTIVITY_W + (widest - 1) * ACTIVITY_GAP_X;
    const w = Math.max(innerW + 2 * STEP_PAD, 240) + laneSpace;
    const h = STEP_HEADER + Math.max(1, denseRows.length) * (ACTIVITY_H + ACTIVITY_GAP_Y) - ACTIVITY_GAP_Y + STEP_PAD;

    const activities: ActivityNode[] = [];
    denseRows.forEach((row, r) => {
      const rowW = row.length * ACTIVITY_W + (row.length - 1) * ACTIVITY_GAP_X;
      const x0 = (w - laneSpace - rowW) / 2;
      row.forEach((ai, k) => {
        const a = rawActivities[ai];
        const onFailure = isObject(a['onFailure']) ? a['onFailure']['action'] : null;
        const cancel = isObject(a['cancellationActivity']) ? a['cancellationActivity'] : null;
        activities[ai] = {
          path: pathToString(['stepList', si, 'activityList', ai]),
          index: ai,
          label: text(a['label'], `activity #${ai + 1}`),
          workflowLabel: text(a['workflowLabel'], '— no workflow —'),
          automatic: a['type'] === 'automatic',
          sync: a['sync'] === true,
          entry: actDag.entries[0] === ai,
          onFailure: typeof onFailure === 'string' ? onFailure : null,
          cancellation: cancel && cancel['active'] === true && typeof cancel['label'] === 'string' ? cancel['label'] : null,
          condition: typeof a['condition'] === 'string' ? a['condition'] : null,
          after: actDag.parents[ai].length > 1 ? actDag.parents[ai].map(p => text(rawActivities[p]['label'], `activity #${p + 1}`)) : null,
          x: x0 + k * (ACTIVITY_W + ACTIVITY_GAP_X),
          y: STEP_HEADER + r * (ACTIVITY_H + ACTIVITY_GAP_Y),
          w: ACTIVITY_W,
          h: ACTIVITY_H,
        };
      });
    });

    return {
      path: pathToString(['stepList', si]),
      index: si,
      label: text(step['label'], `step #${si + 1}`),
      automatic: step['type'] === 'automatic',
      sync: step['sync'] === true,
      entry: stepDag.entries[0] === si,
      after: stepDag.parents[si].length > 1 ? stepDag.parents[si].map(p => text(rawSteps[p]['label'], `step #${p + 1}`)) : null,
      activities,
      x: 0,
      y: 0,
      w,
      h,
    };
  });

  // 2. Group steps into columns by depth, and wrap columns onto rows that fit maxWidth.
  const columns = stepDag.depth
    .reduce<number[][]>((cols, d, si) => ((cols[d] ??= []).push(si), cols), [])
    .filter(c => c && c.length);
  const colWidths = columns.map(c => Math.max(...c.map(si => steps[si].w)));
  const colHeights = columns.map(c => c.reduce((h, si) => h + steps[si].h + STEP_GAP_Y, -STEP_GAP_Y));
  const colOf: number[] = [];
  columns.forEach((c, ci) => c.forEach(si => (colOf[si] = ci)));

  const x0 = MARGIN + START_SPACE;
  const rows: number[][] = [[]];
  let rowWidth = 0;
  columns.forEach((_, ci) => {
    const needed = (rows[rows.length - 1].length ? STEP_GAP_X : 0) + colWidths[ci];
    if (rows[rows.length - 1].length && x0 + rowWidth + needed + MARGIN > maxWidth) {
      rows.push([]);
      rowWidth = 0;
    }
    rows[rows.length - 1].push(ci);
    rowWidth += rows[rows.length - 1].length > 1 ? needed : colWidths[ci];
  });
  const rowOfCol: number[] = [];
  rows.forEach((row, r) => row.forEach(ci => (rowOfCol[ci] = r)));
  const rowOf = (si: number) => rowOfCol[colOf[si]];

  // 3. Classify every link, so each kind can be routed where it does not cross other steps:
  //    - next:  to the very next column of the same row -> sideways curve into the left side;
  //    - over:  further along the same row (skips steps)  -> up into a lane above the row, down into the top;
  //    - wrap:  to another row, or backwards (cycles)     -> down into a lane below the row, across, into the top.
  type Kind = 'next' | 'over' | 'wrap';
  const links: { p: number; c: number; kind: Kind; lane: number; broken: boolean }[] = [];
  stepDag.parents.forEach((parents, c) => {
    for (const p of parents) {
      const sameRow = rowOf(p) === rowOf(c);
      const kind: Kind = sameRow && colOf[c] === colOf[p] + 1 ? 'next' : sameRow && colOf[c] > colOf[p] ? 'over' : 'wrap';
      links.push({ p, c, kind, lane: 0, broken: stepDag.inCycle.has(c) && stepDag.inCycle.has(p) });
    }
  });
  // Lanes are handed out by position (not definition order) so parallel connectors never cross: below a row, the
  // further right a link starts, the lower its lane; above a row, the longer a link, the higher its lane.
  const overLanes = rows.map(() => 0);
  const wrapLanes = rows.map(() => 0);
  const byPosition = (kind: Kind, key: (l: (typeof links)[number]) => number) =>
    links.filter(l => l.kind === kind).sort((a, b) => key(a) - key(b) || colOf[a.c] - colOf[b.c]);
  for (const link of byPosition('wrap', l => colOf[l.p])) {
    link.lane = wrapLanes[rowOf(link.p)]++;
  }
  for (const link of byPosition('over', l => colOf[l.c] - colOf[l.p])) {
    link.lane = overLanes[rowOf(link.p)]++;
  }

  // 4. Place the rows, leaving room for their lanes.
  const rowTop: number[] = [];
  const rowBottom: number[] = [];
  let y0 = MARGIN;
  let width = 0;
  rows.forEach((row, r) => {
    y0 += overLanes[r] ? LANE_PAD + overLanes[r] * LANE_STEP : 0;
    let x = x0;
    for (const ci of row) {
      let y = y0;
      for (const si of columns[ci]) {
        steps[si].x = x + (colWidths[ci] - steps[si].w) / 2;
        steps[si].y = y;
        y += steps[si].h + STEP_GAP_Y;
      }
      x += colWidths[ci] + STEP_GAP_X;
    }
    width = Math.max(width, x - STEP_GAP_X + MARGIN);
    rowTop[r] = y0;
    rowBottom[r] = y0 + Math.max(...row.map(ci => colHeights[ci]));
    y0 = rowBottom[r] + Math.max(ROW_GAP, LANE_PAD * 2 + wrapLanes[r] * LANE_STEP);
  });
  const lastRow = rows.length - 1;
  const height = rowBottom[lastRow] + MARGIN + (wrapLanes[lastRow] ? LANE_PAD * 2 + wrapLanes[lastRow] * LANE_STEP : 0);

  // 5. Ports: every link gets its own point on the steps it connects, so joins and forks stay distinguishable.
  const spread = (box: Box, k: number, n: number, from = 0.2, to = 0.8) =>
    box.x + box.w * (n === 1 ? (from + to) / 2 : from + ((to - from) * k) / (n - 1));
  const ports = new Map<(typeof links)[number], { sx: number; sy: number; tx: number; ty: number }>();
  steps.forEach((step, si) => {
    const outTop = links.filter(l => l.p === si && l.kind === 'over').sort((a, b) => steps[a.c].x - steps[b.c].x);
    const outBottom = links.filter(l => l.p === si && l.kind === 'wrap').sort((a, b) => steps[a.c].x - steps[b.c].x);
    const inTop = links.filter(l => l.c === si && l.kind !== 'next').sort((a, b) => steps[a.p].x - steps[b.p].x);
    const inLeft = links.filter(l => l.c === si && l.kind === 'next').sort((a, b) => steps[a.p].y - steps[b.p].y);
    const outRight = links.filter(l => l.p === si && l.kind === 'next').sort((a, b) => steps[a.c].y - steps[b.c].y);
    const set = (l: (typeof links)[number], v: Partial<{ sx: number; sy: number; tx: number; ty: number }>) =>
      ports.set(l, { ...{ sx: 0, sy: 0, tx: 0, ty: 0 }, ...ports.get(l), ...v });
    outTop.forEach((l, k) => set(l, { sx: spread(step, k, outTop.length, 0.55, 0.9), sy: step.y }));
    outBottom.forEach((l, k) => set(l, { sx: spread(step, k, outBottom.length, 0.3, 0.7), sy: step.y + step.h }));
    inTop.forEach((l, k) => set(l, { tx: spread(step, k, inTop.length, 0.15, 0.45), ty: step.y }));
    const headerPorts = (n: number, k: number) => step.y + (n === 1 ? STEP_HEADER / 2 : 12 + ((STEP_HEADER - 18) * k) / (n - 1));
    inLeft.forEach((l, k) => set(l, { tx: step.x, ty: headerPorts(inLeft.length, k) }));
    outRight.forEach((l, k) => set(l, { sx: step.x + step.w, sy: headerPorts(outRight.length, k) }));
  });

  const stepEdges: Edge[] = links.map(link => {
    const { sx, sy, tx, ty } = ports.get(link)!;
    let d: string;
    if (link.kind === 'next') {
      const bend = Math.max(36, (tx - sx) / 2);
      d = `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`;
    } else {
      const r = rowOf(link.p);
      const laneY =
        link.kind === 'over'
          ? rowTop[r] - LANE_PAD / 2 - link.lane * LANE_STEP
          : rowBottom[r] + LANE_PAD + link.lane * LANE_STEP;
      d = orthogonal([
        [sx, sy],
        [sx, laneY],
        [tx, laneY],
        [tx, ty],
      ]);
    }
    return { d, broken: link.broken, from: steps[link.p].path, to: steps[link.c].path };
  });

  const activityEdges: Edge[] = [];
  steps.forEach((step, si) => {
    const links = activityLinks[si];
    const acts = step.activities;
    const abs = (a: ActivityNode) => ({ x: step.x + a.x, y: step.y + a.y, w: a.w, h: a.h });
    // Ports: each link gets its own point, spread along the edge it uses.
    const port = new Map<ActivityLink, { sx: number; sy: number; tx: number; ty: number }>();
    acts.forEach((a, ai) => {
      if (!a) {
        return;
      }
      const box = abs(a);
      const along = (k: number, n: number, from: number, to: number) => (n === 1 ? (from + to) / 2 : from + ((to - from) * k) / (n - 1));
      const outDown = links.filter(l => l.p === ai && !l.skip).sort((x, y) => acts[x.c].x - acts[y.c].x);
      const inTop = links.filter(l => l.c === ai && !l.skip).sort((x, y) => acts[x.p].x - acts[y.p].x);
      const outSide = links.filter(l => l.p === ai && l.skip).sort((x, y) => x.lane - y.lane);
      const inSide = links.filter(l => l.c === ai && l.skip).sort((x, y) => x.lane - y.lane);
      const set = (l: ActivityLink, v: Partial<{ sx: number; sy: number; tx: number; ty: number }>) =>
        port.set(l, { ...{ sx: 0, sy: 0, tx: 0, ty: 0 }, ...port.get(l), ...v });
      outDown.forEach((l, k) => set(l, { sx: box.x + box.w * along(k, outDown.length, 0.3, 0.7), sy: box.y + box.h }));
      inTop.forEach((l, k) => set(l, { tx: box.x + box.w * along(k, inTop.length, 0.3, 0.7), ty: box.y }));
      outSide.forEach((l, k) => set(l, { sx: box.x + box.w, sy: box.y + box.h * along(k, outSide.length, 0.55, 0.85) }));
      inSide.forEach((l, k) => set(l, { tx: box.x + box.w, ty: box.y + box.h * along(k, inSide.length, 0.15, 0.45) }));
    });
    const laneBase = step.x + step.w - LANE_PAD / 2;
    for (const link of links) {
      const pt = port.get(link);
      if (!pt) {
        continue;
      }
      const d = link.skip
        ? orthogonal([
            [pt.sx, pt.sy],
            [laneBase - link.lane * LANE_STEP, pt.sy],
            [laneBase - link.lane * LANE_STEP, pt.ty],
            [pt.tx, pt.ty],
          ])
        : verticalCurve(pt.sx, pt.sy, pt.tx, pt.ty);
      activityEdges.push({ d, broken: link.broken, from: acts[link.p].path, to: acts[link.c].path });
    }
  });

  const entry = stepDag.entries.length ? steps[stepDag.entries[0]] : null;
  const start = entry ? { x: MARGIN + 10, y: entry.y + STEP_HEADER / 2 } : null;
  if (start && entry) {
    stepEdges.push({ d: `M ${start.x + 8} ${start.y} L ${entry.x} ${start.y}`, broken: false, from: '', to: entry.path });
  }

  return { width: Math.max(width, 320), height: Math.max(height, 160), steps, stepEdges, activityEdges, start };
}

function orthogonal(points: [number, number][]): string {
  const r = 8;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const inLen = Math.hypot(x - px, y - py);
    const outLen = Math.hypot(nx - x, ny - y);
    const k = Math.min(r, inLen / 2, outLen / 2);
    if (k < 1) {
      d += ` L ${x} ${y}`;
      continue;
    }
    const ax = x - ((x - px) / inLen) * k;
    const ay = y - ((y - py) / inLen) * k;
    const bx = x + ((nx - x) / outLen) * k;
    const by = y + ((ny - y) / outLen) * k;
    d += ` L ${ax} ${ay} Q ${x} ${y} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last[0]} ${last[1]}`;
}

function verticalCurve(x1: number, y1: number, x2: number, y2: number): string {
  const bend = Math.max(16, Math.abs(y2 - y1) / 2);
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}
