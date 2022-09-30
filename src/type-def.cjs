/**
 * @typedef ENTITY_TYPE
 * @property {string} tag Contains the full extracted tag from the source code
 * i.e. <link rel="stylesheet" href="./node_modules/analogger/dist/ana-light.min.css" />
 * @property {string} uri Contains the href or src content
 * i.e. "./node_modules/analogger/dist/ana-light.min.css"
 * @property {string} pathname Similar to above
 * @property {string} originalUri
 *
 * @property {string} name Asset name without the extension i.e. ana-light.min
 * @property {string} base Asset name with the extension i.e. ana-light.min.css
 * @property {string} ext Extension only  i.e. ".css"
 * @property {string} dir "Directory" on the server i.e. "/node_modules/analogger/dist"
 * @property {string} fullname Asset name with the extension
 * @property {CATEGORY_TYPE} category Asset type
 *
 *
 * @property {string} sourcePath Asset path on disk
 * @property {string} sourceDir Folder the asset belongs to on disk
 * @property {string} rootFolder Root folder for all assets
 *
 * @property {string} replacement Replacement string used in the processed source to temporarily replace the full tag
 * @property {string} tagID Tag ID used to index replacement strings
 *
 */