// Backwards compatibility - re-export from new location
export * from '../log/KonaLogAdapter';
export { KonaLogAdapter as FuseBoxLogAdapter, createKonaLogger as createFuseLogger } from '../log/KonaLogAdapter';
