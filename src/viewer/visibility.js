export const MIGRATION_VISIBILITY_DEFAULTS=Object.freeze({includeHiddenPaths:false});
// Display filtering only. Node/edge facts and statistics remain backend-owned.
export function migrationVisible({routeEnabled=true,sourceVisible=true,targetVisible=true,sourcePathVisible=true,targetPathVisible=true,includeHiddenPaths=MIGRATION_VISIBILITY_DEFAULTS.includeHiddenPaths}={}) {
  return Boolean(routeEnabled&&(includeHiddenPaths||(sourceVisible&&targetVisible&&sourcePathVisible&&targetPathVisible)));
}
