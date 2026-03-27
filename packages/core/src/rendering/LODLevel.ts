export enum LODLevel {
  Overview = "overview",
  Section = "section",
  Detail = "detail",
}

const SECTION_THRESHOLD = 0.3;
const DETAIL_THRESHOLD = 0.7;

export function getLODLevel(zoom: number): LODLevel {
  if (zoom < SECTION_THRESHOLD) return LODLevel.Overview;
  if (zoom < DETAIL_THRESHOLD) return LODLevel.Section;
  return LODLevel.Detail;
}
