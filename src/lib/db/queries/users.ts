import { firstOrUndefined } from "src/functions";
import { db } from "..";
import { users,feeds, feed_follows, NewPost, posts } from "../schema";
import { eq,asc, and, sql,desc } from "drizzle-orm";

export async function createUser(name: string) {
  const [result] = await db.insert(users).values({ name: name }).returning();
  return result;
}

export async function getUser(name:string) {
    const [result] = await db.select().from(users).where(eq(users.name,name))
    return result;
}

export async function resetUsers() {
    await db.delete(users)
}

export async function getUsers() {
    const result = await db.select().from(users).orderBy(asc(users.name));
    return result
}

export async function createFeed(name: string, url: string, user_id: string) {
  const [result] = await db
    .insert(feeds)
    .values({ name, url, user_id })
    .returning();
  return result;
}

export async function getFeeds() {
    const result = await db.select({
      feedName: feeds.name,
      feedUrl: feeds.url,
      userName: users.name,
    })
    .from(feeds)
    .innerJoin(users, eq(feeds.user_id, users.id))
    .orderBy(asc(feeds.name));
    return result
}

export async function createFeedFollow(userId: string, feedId: string) {
  const [newFeedFollow] = await db
    .insert(feed_follows)
    .values({ userId, feedId })
    .returning({
      id: feed_follows.id,
      createdAt: feed_follows.createdAt,
      updatedAt: feed_follows.updatedAt,
      userId: feed_follows.userId,
      feedId: feed_follows.feedId,
    });

  if (!newFeedFollow) {
    throw new Error("Failed to create feed follow");
  }

  const [result] = await db
    .select({
      id: feed_follows.id,
      createdAt: feed_follows.createdAt,
      updatedAt: feed_follows.updatedAt,
      userId: feed_follows.userId,
      feedId: feed_follows.feedId,
      userName: users.name,
      feedName: feeds.name,
    })
    .from(feed_follows)
    .innerJoin(users, eq(feed_follows.userId, users.id))
    .innerJoin(feeds, eq(feed_follows.feedId, feeds.id))
    .where(eq(feed_follows.id, newFeedFollow.id));

  if (!result) {
    throw new Error("Failed to load created feed follow");
  }

  return result;
}

export async function getFeedFollowsForUser(userId:string) {
  const res = await db.select({
      id: feed_follows.id,
      createdAt: feed_follows.createdAt,
      updatedAt: feed_follows.updatedAt,
      userId: feed_follows.userId,
      feedId: feed_follows.feedId,
      userName: users.name,
      feedName: feeds.name,
      feedUrl: feeds.url,
  }).from(feed_follows).innerJoin(users,eq(feed_follows.userId,users.id)).innerJoin(feeds,eq(feed_follows.feedId,feeds.id)).where(eq(feed_follows.userId,userId)).orderBy(asc(feeds.name))
  return res
}

export async function getFeedByUrl(url: string) {
  const [feed] = await db.select().from(feeds).where(eq(feeds.url, url));
  return feed;
}

export async function deleteFeedFollow(userId:string,url:string){
  const feed = await getFeedByUrl(url)
  const res = await db.delete(feed_follows).where(and(eq(feed_follows.userId,userId),eq(feed_follows.feedId,feed.id))).returning({
      id: feed_follows.id,
  });
    if (res.length === 0) {
    throw new Error(`You are not following "${url}"`);
  }
  
  return res[0];
}

export async function markFeedFetched(feedId: string) {
  const result = await db
    .update(feeds)
    .set({
      last_fetched_at: new Date(),
    })
    .where(eq(feeds.id, feedId))
    .returning();
  return firstOrUndefined(result);
}

export async function getNextFeedToFetch() {
  const result = await db
    .select()
    .from(feeds)
    .orderBy(sql`${feeds.last_fetched_at} desc nulls first`)
    .limit(1);
  return firstOrUndefined(result);
}

export async function createPost(post:NewPost) {
    const [res] = await db.insert(posts).values(post).returning()
    return res;
}

export async function getPostsForUser(userId:string,limit:number){
  const result = await db.select({id: posts.id,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      title: posts.title,
      url: posts.url,
      description: posts.description,
      publishedAt: posts.published_at,
      feedId: posts.feed_id,
      feedName: feeds.name,}).from(posts).innerJoin(feed_follows,eq(posts.feed_id,feed_follows.feedId)).where(eq(feed_follows.userId,userId)).orderBy(desc(posts.published_at)).limit(limit)
      return result
}