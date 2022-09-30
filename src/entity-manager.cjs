
const fs = require("fs");

const {joinPath} = require("@thimpat/libutils");

const {getPathName, lookupRootPath, lookupStaticPath} = require("./source-finder.cjs");
const {MASKS} = require("./constants.cjs");
const path = require("path");

const lookup = {};
const entities = {};
const prod = {};

/**
 * @typedef CATEGORY_TYPE
 * @type {{CSS: string, SCRIPT: string, GENERIC: string, EXTRAS: string, ESM: string, MEDIAS: string}}
 */
const CATEGORY = {
    CSS    : "css",
    SCRIPT : "script",
    ESM    : "esm",
    GENERIC: "generic",
    EXTRAS : "extras",
    MEDIAS : "medias"
};

/**
 * Check if a JavaScript string is a URL
 * @see https://stackoverflow.com/questions/5717093/check-if-a-javascript-string-is-a-url/45567717#45567717
 * @param string
 * @returns {boolean}
 */
const isUrl = string =>
{
    try
    {
        return Boolean(new URL(string));
    }
    catch (e)
    {
        return false;
    }
};

/**
 * An entity here is an object that keeps various information related to a tag (link, script, etc)
 * extracted from the code source.
 * @param category
 * @param {ENTITY_TYPE} entity
 * @param referenceDir
 * @returns {{replacement: string}|null}
 */
const addEntity = (category, entity, referenceDir = "") =>
{
    try
    {
        if (!entity.uri)
        {
            return null;
        }

        if (isUrl(entity.uri))
        {
            return null;
        }

        const validPathname = getPathName(entity.uri);
        if (validPathname === "/")
        {
            return null;
        }

        if (validPathname)
        {
            entity.pathname = validPathname;
            const info = path.parse(entity.pathname);

            // Name without extension
            entity.name = info.name;

            // Name with extension
            entity.base = info.base;

            // // Name without special characters that contains uri symbols like # ?
            // entity.filename = getPathName(entity.base, {withTrailingSlash: false});

            entity.ext = info.ext;
            entity.dir = info.dir;

            const subParts = entity.pathname.split("/");
            entity.fullname = subParts[subParts.length - 1];
        }

        let resLookups;
        if (referenceDir)
        {
            const sourcePath = joinPath(referenceDir, entity.pathname);
            if (!fs.existsSync(sourcePath))
            {
                if (lookupStaticPath(entity.pathname))
                {
                    console.log(`[${entity.pathname}] is in the public directory. No action taken`);
                    return null;
                }

                console.error(`Could not find [${entity.pathname}]`);
                return null;
            }
            resLookups = {
                rootFolder: referenceDir,
                sourcePath
            };
        }
        else
        {
            resLookups = lookupRootPath(entity.pathname || entity.uri);
            if (!resLookups)
            {
                if (entity.uri.indexOf("#") > -1)
                {
                    return null;
                }

                if (lookupStaticPath(entity.uri))
                {
                    console.log(`[${entity.uri}] is in the public directory. No action taken`);
                    return null;
                }

                console.error(`Could not find local matching path for [${entity.uri}]. Skipping`);
                return null;
            }
        }

        const {rootFolder, sourcePath} = resLookups;

        entity.category = category;
        entity.sourcePath = sourcePath;
        entity.sourceDir = path.parse(sourcePath).dir;
        entity.rootFolder = rootFolder;

        entities[category] = entities[category] || [];
        entities[category].push(entity);

        lookup[entity.uri] = entity;

        const counter = entities[category].length - 1;

        const tagID = `${category}(${counter})`;
        const replacement = `${MASKS.DELIMITER}${tagID}${MASKS.DELIMITER}`;

        entity.tagID = tagID;
        entity.replacement = replacement;
        entity.originalUri = entity.uri;

        return {replacement};
    }
    catch (e)
    {
        console.error({lid: 3001}, e.message);
    }

    return null;
};

const getEntityFromUri = (uri) =>
{
    return lookup[uri];
};

const getEntities = (category) =>
{
    return entities[category] || [];
};


const addProdCode = ({entity}) =>
{
    try
    {
        prod[entity.tagID] = entity;
        return true;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return false;
};

const getCodeTagID = (tagID) =>
{
    return prod[tagID];
};

const getProdCode = () =>
{
    return prod;
};

module.exports.CATEGORY = CATEGORY;

module.exports.addEntity = addEntity;

module.exports.getEntityFromUri = getEntityFromUri;
module.exports.getEntities = getEntities;

module.exports.addProdCode = addProdCode;
module.exports.getCodeTagID = getCodeTagID;
module.exports.getProdCode = getProdCode;
