/**
 * The file reader's command (fileReader.ts). The app starts it with
 * ELECTRON_RUN_AS_NODE inside a member's folder walls; it is not for agents.
 */
import { readerMain } from './fileReader';

readerMain(process.argv.slice(2));
