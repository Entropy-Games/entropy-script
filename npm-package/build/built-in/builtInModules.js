import{ESNamespace,ESObject,ESPrimitive,ESString}from"../runtime/primitiveTypes.js";import{ESSymbol}from"../runtime/context.js";import maths from"./built-in-modules/maths.js";import ascii from"./built-in-modules/ascii.js";const modules={maths:maths,ascii:ascii},processedModules={};export function processRawModule(e,o){const s={},i=e.valueOf();for(const e in i)s[e]=new ESSymbol(i[e],e);return new ESNamespace(new ESString(o),s,!1)}export function moduleExist(e){return e in modules}export function addModule(e,o){modules[e]={},processedModules[e]=o}export function addModuleFromObj(e,o){addModule(e,processRawModule(ESPrimitive.wrap(o),e))}export function getModule(e){if(e in processedModules)return processedModules[e];if(e in modules){const o=ESPrimitive.wrap(modules[e]);if(!(o instanceof ESObject))return void console.log("Error: module "+e+"is not of type object".red);const s=processRawModule(o,e);return processedModules[e]=s,s}}