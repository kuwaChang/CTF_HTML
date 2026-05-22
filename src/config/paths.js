const path = require("path");

const ROOT = path.join(__dirname, "../..");

module.exports = {
  ROOT,
  STORAGE: path.join(ROOT, "storage"),
  CONFIG: path.join(ROOT, "config"),
  CONTENT: path.join(ROOT, "content"),
  VIEWS: path.join(ROOT, "views"),
  PUBLIC: path.join(ROOT, "public"),
  UPLOADS: path.join(ROOT, "public", "uploads"),
  TEMP: path.join(ROOT, "temp"),
  FLAGS: path.join(ROOT, "flags"),
  LABS: path.join(ROOT, "labs"),
  DOCS: path.join(ROOT, "docs"),
};
