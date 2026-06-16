#!/usr/bin/env node
import { reportCliError, runCli } from "../dist/cli.js";

runCli().catch(reportCliError);
