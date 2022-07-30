const lookup = {};
const entities = {};

const CATEGORY = {
    CSS    : "css",
    SCRIPT : "script",
    ESM    : "esm",
    GENERIC: "generic"
};

const addEntity = (category, entity) =>
{
    try
    {
        entity.category = category;

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