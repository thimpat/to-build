const {resolvePath, joinPath} = require("@thimpat/libutils");
const fs = require("fs");

let rootFolders = [];
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

        let cwd = process.cwd();
        cwd = resolvePath(cwd);

        rootFolders.unshift(cwd);

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

module.exports.setRoots = setRoots;
module.exports.getRoots = getRoots;