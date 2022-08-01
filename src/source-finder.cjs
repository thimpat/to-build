const path = require("path");
const fs = require("fs");

const {resolvePath, joinPath} = require("@thimpat/libutils");

let rootFolders = [];
let staticFolders = [];

/**
 * Define directories where the assets will be looked for
 * The directory where the html being parsed is the default
 * node_modules/ is also part of it
 * @param htmlPathFolder
 * @param roots
 * @returns {boolean}
 */
const setRoots = (htmlPathFolder, roots ) =>
{
    try
    {
        rootFolders = [];
        if (htmlPathFolder)
        {
            rootFolders.push(htmlPathFolder);
        }

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

        // Add the current working directory to the lookup path list?
        let cwd = process.cwd();
        cwd = resolvePath(cwd);
        // rootFolders.push(cwd);

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

const setStaticDirs = (dirs) =>
{
    try
    {
        if (!dirs)
        {
            return [];
        }

        if (!Array.isArray(dirs))
        {
            if (dirs.indexOf(",") > -1)
            {
                dirs = dirs.split(",");
            }
            else
            {
                dirs = [dirs];
            }
        }

        for (let i = 0; i < dirs.length; ++i)
        {
            let dir = dirs[i];
            dir = resolvePath(dir);

            if (!dir)
            {
                continue;
            }

            staticFolders.push(dir);
        }

        staticFolders = [...new Set(staticFolders)];
        return true;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return false;
};

const getStaticDirs = () =>
{
    return staticFolders;
};

const getPathName = (uri, {withTrailingSlash = true} = {}) =>
{
    try
    {
        const result = new URL(uri, "http://someaddress");
        if (!result)
        {
            return null;
        }

        if (!result.pathname)
        {
            return "";
        }

        if (!withTrailingSlash)
        {
            if (result.pathname.charAt(0) === "/")
            {
                return result.pathname.substring(1);
            }
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
 * Look for uri in various folders
 * - node_modules
 * - folders defined with --root folder option
 * @param uri
 * @returns {null|*}
 */
const lookupRootPath = (uri) =>
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

const lookupStaticPath = (uri) =>
{
    if (!uri)
    {
        return null;
    }

    try
    {
        const lookupFolders = getStaticDirs();

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

module.exports.setStaticDirs = setStaticDirs;
module.exports.getStaticDirs = getStaticDirs;

module.exports.getPathName = getPathName;

module.exports.lookupRootPath = lookupRootPath;
module.exports.lookupStaticPath = lookupStaticPath;