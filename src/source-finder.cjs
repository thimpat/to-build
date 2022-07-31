const {resolvePath, joinPath} = require("@thimpat/libutils");
const fs = require("fs");

let rootFolders = [];

/**
 * Define directories where the assets will be look for
 * @param roots
 * @returns {boolean}
 */
const setRoots = (roots) =>
{
    try
    {
        if (!roots)
        {
            roots = [];
        }
        else if (!Array.isArray(roots))
        {
            roots = roots.split(",")[0];
        }

        rootFolders = [];
        for (let i = 0; i < roots.length; ++i)
        {
            let root = roots[i].trim();
            if (!root)
            {
                continue;
            }

            root = resolvePath(root);
            rootFolders.push(root);
        }

        // Add the current working directory to the lookup path list
        let cwd = process.cwd();
        cwd = resolvePath(cwd);

        rootFolders.unshift(cwd);

        // Add the node_modules directory to the lookup path list
        const nodeModulePath = joinPath(cwd, "node_modules");
        if (fs.existsSync(nodeModulePath))
        {
            rootFolders.push(nodeModulePath);
        }

        return true;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return false;
};

const getRoots = () =>
{
    return rootFolders;
};

const getPathName = (uri) =>
{
    try
    {
        const result = new URL(uri, "http://someaddress");
        if (!result)
        {
            return null;
        }

        return result.pathname;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return null;
};

/**
 * Look for uri in various folders (root folder defined by user like node_modules)
 * @param uri
 * @returns {null|*}
 */
const lookupSourcePath = (uri) =>
{
    if (!uri)
    {
        return null;
    }

    try
    {
        if (fs.existsSync(uri))
        {
            uri = resolvePath(uri);
            return uri;
        }
    }
    catch (e)
    {
    }

    try
    {
        const lookupFolders = getRoots();

        for (let i = 0; i < lookupFolders.length; ++i)
        {
            const rootFolder = lookupFolders[i];
            const sourcePath = joinPath(rootFolder, uri);
            if (fs.existsSync(sourcePath))
            {
                return {rootFolder, sourcePath};
            }
        }
    }
    catch (e)
    {
        console.error({lid: 1001}, e.message);
    }

    return null;
};


module.exports.setRoots = setRoots;
module.exports.getRoots = getRoots;
module.exports.getPathName = getPathName;
module.exports.lookupSourcePath = lookupSourcePath;