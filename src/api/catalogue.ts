// The catalogue wire model and its clients are core's.
//
// This was a second implementation of both, with the same node/cluster layering
// arrived at independently. `ClusterCatalogueApi` takes the router directly, so
// reads fail over and feed endpoint health exactly as every other call does.
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
