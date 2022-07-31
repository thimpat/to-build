const {lookupSourcePath, getPathName} = require("./source-finder.cjs");
const lookup = {};
const entities = {};

const CATEGORY = {
    CSS    : "css",
    SCRIPT : "script",
    ESM    : "esm",
    GENERIC: "generic",
    METAS  : "metas",
    MEDIAS : "medias"
};

/**
 * Check if a JavaScript string is a URL
 * @see https://stackoverflow.com/questions/5717093/check-if-a-javascript-string-is-a-url/45567717#45567717
 * @param string
 * @returns {boolean}
 */
const isUrl = string => {
    try { return Boolean(new URL(string)); }
    catch(e){ return false; }
};

const addEntity = (category, entity) =>
{
    try
    {
        if (!entity.uri)
        {
            return false;
        }

        if (isUrl(entity.uri))
        {
            return false;
        }

        const validPathname = getPathName(entity.uri);
        if (validPathname === "/")
        {
            return false;
        }

        if (validPathname)
        {
            entity.pathname = validPathname;
        }

        const resLookups = lookupSourcePath(entity.pathname || entity.uri);
        if (!resLookups)
        {
            if (entity.uri.indexOf("#") > -1)
            {
                return false;
            }

            console.error(`Could not find local matching path for [${entity.uri}]. Skipping`);
            return false;
        }

        const {rootFolder, sourcePath} = resLookups;

        entity.category = category;
        entity.sourcePath = sourcePath;
        entity.sourceDir = rootFolder;

        entities[category] = entities[category] || [];
        entities[category].push(entity);

        lookup[entity.uri] = entity;

        return true;
    }
    catch (e)
    {
        console.error({lid: 3001}, e.message);
    }

    return false;
};

const getEntityFromUri = (uri) =>
{
    return lookup[uri];
};

const getEntities = (category) =>
{
    return entities[category] || [];
};

module.exports.CATEGORY = CATEGORY;

module.exports.addEntity = addEntity;
module.exports.getEntityFromUri = getEntityFromUri;
module.exports.getEntities = getEntities;