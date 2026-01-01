import { setUser, readConfig, writeConfig } from "./config"
import { parseDuration } from "./functions";
import { createFeed, createFeedFollow, createPost, createUser, deleteFeedFollow, getFeedByUrl, getFeedFollowsForUser, getFeeds, getNextFeedToFetch, getPostsForUser, getUser, getUsers, markFeedFetched } from "./lib/db/queries/users";
import { Feed, NewPost, User } from "./lib/db/schema";
import { CommandHandler, CommandsRegistry, RSSFeed, RSSItem, UserCommandHandler } from "./types"
import { XMLParser } from "fast-xml-parser";

export async function handlerLogin(cmdName: string, ...args: string[]) {
    if(args.length === 0){
        throw new Error(`Command "${cmdName}" expects 1 argument: <username>`);
    }
    const userName = args[0];
    const user = await getUser(userName);
    if (!user) {
        throw new Error(`User "${userName}" does not exist`);
    }
    const config = readConfig()
    setUser(args[0],config)
    console.log("User has been set")

}

export async function handlerRegister(cmdName: string, ...args: string[]) {
  if (args.length === 0) {
    throw new Error(`Command "${cmdName}" expects 1 argument: <username>`);
  }

  const userName = args[0];

  try {
    const res = await createUser(userName);

    const cfg = readConfig();
    writeConfig({ ...cfg, currentUserName: userName });

    console.log("User has been created");
    console.log(res);
  } catch (e) {
    throw new Error("User already exists");
  }
}

export async function registerCommand(registry: CommandsRegistry, cmdName: string, handler: CommandHandler){
    registry[cmdName] = handler;
}

export async function runCommand(registry: CommandsRegistry, cmdName: string, ...args: string[]) {
  const handler = registry[cmdName];
  if (!handler) throw new Error(`Unknown command: ${cmdName}`);
  await handler(cmdName, ...args);
}

export const handlerUsers: CommandHandler = async () => {
  const cfg = readConfig();
  const allUsers = await getUsers();

  for (const u of allUsers) {
    const suffix = u.name === cfg.currentUserName ? " (current)" : "";
    console.log(`* ${u.name}${suffix}`);
  }
};

function isValidString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function fetchFeed(feedURL: string): Promise<RSSFeed> {
    const res = await fetch(feedURL,{headers:{"User-agent":"gator",},})
    if(!res.ok){
        throw new Error("Fail to fetch")
    }
    const xml = await res.text()
    const parser = new XMLParser
    const parsed = parser.parse(xml)

    const channel = parsed?.rss?.channel
    if (!channel) {
        throw new Error("invalid rss feed: missing channel");
    }
    const title = channel.title
    const link = channel.link
    const description = channel.description

      if (!isValidString(title)) throw new Error("invalid rss feed: missing channel title");
      if (!isValidString(link)) throw new Error("invalid rss feed: missing channel link");
      if (!isValidString(description)) throw new Error("invalid rss feed: missing channel description");

  let itemsRaw: unknown = channel.item;
  if (!Array.isArray(itemsRaw)) {
    itemsRaw = [];
  }

  const items: RSSItem[] = [];
  for (const it of itemsRaw as any[]) {
    const itTitle = it?.title;
    const itLink = it?.link;
    const itDesc = it?.description;
    const itPubDate = it?.pubDate;

    if (!isValidString(itTitle)) continue;
    if (!isValidString(itLink)) continue;
    if (!isValidString(itDesc)) continue;
    if (!isValidString(itPubDate)) continue;

    items.push({
      title: itTitle,
      link: itLink,
      description: itDesc,
      pubDate: itPubDate,
    });
  }

  return {
    channel: {
      title,
      link,
      description,
      item: items,
    },
  };
}

export async function handlerAgg(cmdName: string, ...args: string[]) {
  if (args.length !== 1) {
    throw new Error(`usage: ${cmdName} <time_between_reqs>`);
  }

  const timeArg = args[0];
  const timeBetweenRequests = parseDuration(timeArg);
  if (!timeBetweenRequests) {
    throw new Error(
      `invalid duration: ${timeArg} — use format 1h 30m 15s or 3500ms`,
    );
  }

  console.log(`Collecting feeds every ${timeArg}...`);

  scrapeFeeds().catch(handleError);

  const interval = setInterval(() => {
    scrapeFeeds().catch(handleError);
  }, timeBetweenRequests);

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      console.log("Shutting down feed aggregator...");
      clearInterval(interval);
      resolve();
    });
  });
}

async function scrapeFeeds() {
  const feed = await getNextFeedToFetch();
  if (!feed) {
    console.log(`No feeds to fetch.`);
    return;
  }
  console.log(`Found a feed to fetch!`);
  scrapeFeed(feed);
}

async function scrapeFeed(feed: Feed) {
  await markFeedFetched(feed.id);

  const feedData = await fetchFeed(feed.url);
  for (let item of feedData.channel.item) {
    console.log(`Found post: %s`, item.title);

    const now = new Date();

    await createPost({
      url: item.link,
      feed_id: feed.id,
      title: item.title,
      createdAt: now,
      updatedAt: now,
      description: item.description,
      published_at: new Date(item.pubDate),
    } satisfies NewPost);
  }

  console.log(
    `Feed ${feed.name} collected, ${feedData.channel.item.length} posts found`,
  );
}

function handleError(err: unknown) {
  console.error(
    `Error scraping feeds: ${err instanceof Error ? err.message : err}`,
  );
}


function printFeed(feed: Feed, user: User) {
  console.log(`* Feed: ${feed.name}`);
  console.log(`  URL: ${feed.url}`);
  console.log(`  User: ${user.name}`);
  console.log(`  Feed ID: ${feed.id}`);
  console.log(`  Created: ${feed.createdAt.toISOString()}`);
}

export const handlerAddFeed: UserCommandHandler = async (
  cmdName,
  user,
  ...args
) => {
  if (args.length < 2) {
    throw new Error(`Command "${cmdName}" expects 2 arguments: <name> <url>`);
  }

  const [name, url] = args;

  const feed = await createFeed(name, url, user.id);
  const follow = await createFeedFollow(user.id, feed.id);

  console.log(`${follow.userName} now follows ${follow.feedName}`);
};

export async function handlerFeeds() {
    const feeds = await getFeeds()
    console.log(JSON.stringify(feeds, null, 2))
}

export const handlerFollow: UserCommandHandler = async (
  cmdName,
  user,
  ...args
) => {
  if (args.length < 1) {
    throw new Error(`Command "${cmdName}" expects 1 argument: <url>`);
  }

  const [url] = args;

  const feed = await getFeedByUrl(url);
  if (!feed) {
    throw new Error(`Feed with url "${url}" does not exist`);
  }

  const follow = await createFeedFollow(user.id, feed.id);
  console.log(`${follow.userName} now follows ${follow.feedName}`);
};


export const handlerFollowing: UserCommandHandler = async (
  _cmdName,
  user
) => {
  const follows = await getFeedFollowsForUser(user.id);

  for (const f of follows) {
    console.log(`* ${f.feedName}`);
  }
};

export const middlewareLoggedIn =
  (handler: UserCommandHandler): CommandHandler =>
  async (cmdName: string, ...args: string[]) => {
    const cfg = readConfig();
    const userName = cfg.currentUserName;

    if (!userName) {
      throw new Error("No user is currently logged in");
    }

    const user = await getUser(userName);
    if (!user) {
      throw new Error(`User "${userName}" not found`);
    }

    await handler(cmdName, user, ...args);
  };

  export const handlerUnfollow: UserCommandHandler = async (cmdName, user, ...args) => {
  if (args.length < 1) {
    throw new Error(`Command "${cmdName}" expects 1 argument: <url>`);
  }

  const [url] = args;

  await deleteFeedFollow(user.id, url);

  console.log(`${user.name} unfollowed ${url}`);
};

export async function handlerBrowse(
  cmdName: string,
  user: User,
  ...args: string[]
) {
  let limit = 2;
  if (args.length === 1) {
    let specifiedLimit = parseInt(args[0]);
    if (specifiedLimit) {
      limit = specifiedLimit;
    } else {
      throw new Error(`usage: ${cmdName} [limit]`);
    }
  }

  const posts = await getPostsForUser(user.id, limit);

  console.log(`Found ${posts.length} posts for user ${user.name}`);
  for (let post of posts) {
    console.log(`${post.publishedAt} from ${post.feedName}`);
    console.log(`--- ${post.title} ---`);
    console.log(`    ${post.description}`);
    console.log(`Link: ${post.url}`);
    console.log(`=====================================`);
  }
}
