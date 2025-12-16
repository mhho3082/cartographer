import { parseArgs } from "node:util";

const options = {
  rsync: {
    type: "boolean",
  },
};

// Values are the seed URLs
// https://nodejs.org/api/util.html#utilparseargsconfig
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options,
});
