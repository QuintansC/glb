// CSS modules (react builder da VTEX): `import styles from "./X.css"`
declare module "*.css" {
  const styles: Record<string, string>;
  export default styles;
}
