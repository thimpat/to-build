const path = require("path");
const fs = require("fs");

const {resolvePath, joinPath} = require("@thimpat/libutils");

let rootFolders = [];

/**
 * Define directories where the assets will be look for
 * @param htmlPath
 * @param roots
 * @returns {boolean}
 */
const setRoots = (htmlPath, roots ) =>
{
    try
    {
        rootFolders = [];
        roots = roots || [];
        if (!Array.isArray(roots))
        {
            if (roots.indexOf(",") > -1)
            {
                roots = roots.split(",")[0];
            }
            else
            {
                roots = [roots];
            }
        }

        // Add the index.html file directory to the lookup root list
        let htmlPathFolder = path.parse(htmlPath).dir;
        if (htmlPathFolder)
        {
            htmlPathFolder = resolvePath(htmlPathFolder);
            rootFolders.unshift(htmlPathFolder);
        }

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

        rootFolders.push(cwd);

        // Add the node_modules directory to the lookup path list
        const nodeModulePath = joinPath(cwd, "node_modules");
        if (fs.existsSync(nodeModulePath))
        {
            rootFolders.push(nodeModulePath);
        }

        rootFolders = [...new Set(rootFolders)];

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