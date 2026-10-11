/** Root-relative asset paths from manifests must stay inside the Pages repository. */
export function publicAsset(path:string):string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//,'')}`
}
