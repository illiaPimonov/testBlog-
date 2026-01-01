import { readConfig, setUser } from "./config";
import {
    handlerAddFeed,
    handlerAgg,
  handlerBrowse,
  handlerFeeds,
  handlerFollow,
  handlerFollowing,
  handlerLogin,
  handlerRegister,
  handlerUnfollow,
  handlerUsers,
  middlewareLoggedIn,
  registerCommand,
  runCommand,
} from "./handlers";
import { resetUsers } from "./lib/db/queries/users";
import { CommandsRegistry } from "./types";

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length < 1) {
    console.error("Error: not enough arguments were provided.");
    process.exit(1);
  }

  const [cmdName, ...args] = argv;

  const registry: CommandsRegistry = {};
  await registerCommand(registry, "register", handlerRegister);
  await registerCommand(registry, "login", handlerLogin);
  await registerCommand(registry,"users",handlerUsers)
  await registerCommand(registry, "agg", handlerAgg);
  await registerCommand(registry, "addfeed", middlewareLoggedIn(handlerAddFeed));
  await registerCommand(registry,"feeds",handlerFeeds)
  await registerCommand(registry, "follow",middlewareLoggedIn(handlerFollow));
  await registerCommand(registry, "following",middlewareLoggedIn(handlerFollowing));
  await registerCommand(registry, "unfollow",middlewareLoggedIn(handlerUnfollow));
  await registerCommand(registry,"browse",middlewareLoggedIn(handlerBrowse))

  try{
    await registerCommand(registry,"reset",() => resetUsers())
  }catch(e){}
  

  try {
    await runCommand(registry, cmdName, ...args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
  process.exit(0);
}

main();
