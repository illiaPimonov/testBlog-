import fs from "fs";
import os from "os";
import path from "path";


export type Config = {
    currentUserName:string
    dbUrl:string;
}


export function setUser(userName:string,config:Config){
    const next: Config = {...config,currentUserName:userName}
    writeConfig(next)
}

export function readConfig():Config{
    const path = getConfigFilePath()
    const raw = fs.readFileSync(path,{encoding:"utf-8"})
    const result = JSON.parse(raw)
    return validateConfig(result)
}

function getConfigFilePath():string {
    return path.join(os.homedir(),".gatorconfig.json")
}
function validateConfig(rawConfig: any): Config {
  if (rawConfig == null || typeof rawConfig !== "object") {
    throw new Error("Invalid config: not an object");
  }

  const dbUrl = rawConfig.db_url;
  const currentUserName = rawConfig.current_user_name;

  if (typeof dbUrl !== "string") {
    throw new Error("Invalid config: db_url must be a string");
  }

  if (currentUserName !== undefined && typeof currentUserName !== "string") {
    throw new Error("Invalid config: current_user_name must be a string");
  }

  return {
    dbUrl,
    currentUserName: typeof currentUserName === "string" ? currentUserName : "",
  };
}

export function writeConfig(cfg: Config): void {
    const path = getConfigFilePath()
    const json = JSON.stringify(    {
      db_url: cfg.dbUrl,
      current_user_name: cfg.currentUserName,
    },
    null,
    2);
    fs.writeFileSync(path,json,{encoding:"utf-8"})
}

export {}