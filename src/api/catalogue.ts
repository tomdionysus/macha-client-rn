// Re-exported from core. `ClusterCatalogueApi` reads through the router, so
// reads fail over and feed endpoint health like every other call.
export { ClusterCatalogueApi, MachaCatalogueApi } from '@machafoundation/core';
export type {
  ArtworkSource,
  CatalogueArtwork,
  CatalogueItem,
  CatalogueKind,
  CatalogueMediaProfile,
  CatalogueMediaStreamProfile,
  CatalogueStatus,
} from '@machafoundation/core';
