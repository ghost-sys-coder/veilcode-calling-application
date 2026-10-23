import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const testDirectory = new URL("../",import.meta.url);
export function loadModule(path, imports = {}) {
  const source = readFileSync(new URL(path,testDirectory),"utf8");
  const { outputText } = ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},
  });
  const loaded = { exports:{} };
  const load = (name) => Object.hasOwn(imports,name) ? imports[name] : require(name);
  new Function("require","module","exports",outputText)(load,loaded,loaded.exports);
  return loaded.exports;
}
