import { join, resolve } from "path";
import { contextDir } from "../../lib/paths.js";

// Defaults to context/pylon; PYLON_OUT_DIR lets a workflow sync into its own dir.
const BASE_DIR = process.env.PYLON_OUT_DIR
  ? resolve(process.env.PYLON_OUT_DIR)
  : contextDir("pylon");

export const TICKETS_DIR = join(BASE_DIR, "tickets");
export const ACCOUNTS_DIR = join(BASE_DIR, "accounts");
export const FETCH_CONCURRENCY = 4;
