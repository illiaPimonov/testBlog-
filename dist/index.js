import { readConfig, setUser } from './config';
function main() {
    const cfg = readConfig();
    setUser("Lane", cfg);
    const update = readConfig();
    console.log(update);
}
main();
