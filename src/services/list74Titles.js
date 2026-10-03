import fs from "fs";

const jsonPath = "c:/tri community/problemstatements.json";
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

data.forEach((item, index) => {
  console.log(`${index + 1}. ${item.title}`);
});
