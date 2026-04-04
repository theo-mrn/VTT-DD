// Polyfill fetch pour Node.js (requis par @firebase/rules-unit-testing)
import { fetch, Headers, Request, Response } from "undici";

Object.assign(globalThis, { fetch, Headers, Request, Response });
