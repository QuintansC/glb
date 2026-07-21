/**
 * Arquivos do painel importados como texto (`with { type: "text" }`) para
 * serem embutidos no executável standalone pelo `bun build --compile`.
 */
declare module "*.html" {
  const content: string;
  export default content;
}
declare module "*.css" {
  const content: string;
  export default content;
}
declare module "*.js" {
  const content: string;
  export default content;
}
