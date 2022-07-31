#!/usr/bin/env node

/**
 * @author Patrice Thimothee
 *
 * @example
 *
 * # Generate minified with source maps in the ./out directory
 * $> to-build src/index.html
 *
 * # Generate minified css with source maps in a folder called "target"
 * $> to-build src/index.html --output target
 *
 * # Generate minified css with no source map
 * $> to-build src/index.html --sourcemaps false
 *
 * # Generate non-minified css
 * $> to-build src/index.html --minifyCss false
 *
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const minimist = require("minimist");
const stripHtmlComments = require("strip-html-comments");
const minifierHtml = require("html-minifier").minify;

const {resolvePath, joinPath} = require("@thimpat/libutils");
const {setRoots, getRoots, setStaticDirs, getStaticDirs} = require("./source-finder.cjs");

const CleanCSS = require("clean-css");
const UglifyJS = require("uglify-js");

const {TARGET, transpileFiles} = require("to-esm");

const {CATEGORY, addEntity, getEntities} = require("./entity-manager.cjs");
const {startGenServer, stopGenServer, infoGenServer, isGenserverUp} = require("genserve");


const parseCli = (argv) =>
{
    return minimist(argv.slice(2));
};

const getBooleanOptionValue = (cli, optionName, defaultValue = false) =>
{
    try
    {
        optionName = optionName.toLowerCase();
        if (!cli.hasOwnProperty(optionName))
        {
            return defaultValue;
        }

        let prop = cli[optionName] || "";
        prop = prop.trim().toLowerCase();

        if (!prop)
        {
            return false;
        }

        return !["false", "no", "none"].includes(prop);
    }
    catch (e)
    {
        console.error({lid: 1031}, e.message);
    }

    return defaultValue;
};

/**
 * Extract uris from the given source code and create some objects from them
 * @param {string} content Source code to parse
 * @param {string} search String for the regex that will do the search. The regex must contain
 * one subgroup that points to the url to extract to be valid. When search is defined, the internal
 * generated regex is ignored.
 * @param referenceDir
 * @param {string} tagName Tag to extract the uri source from (can be a regex string)
 * @param {string} sourceRefName Property that contains the uri to register
 * @param {string} extraProperty When the tag is detected, we can check whether a property is there to narrow down
 * the selection. (can be a regex string)
 * @param {CATEGORY_TYPE} category
 * @returns {*}
 */
const extractEntities = (content, {
    search = "",
    referenceDir = "",
    tagName = "link",
    sourceRefName = "href",
    extraProperty = null,
    category = ""
} = {}) =>
{
    try
    {
        category = category || tagName + "_" + sourceRefName;

        search = search || `<${tagName} .*?\\b${sourceRefName}\\s*=\\s*["']([^"']+)["'].*?>(<\/${tagName}>)?`;
        const regexp = new RegExp(search, "gmi");
        const matches = [...content.matchAll(regexp)];
        if (!matches || !matches.length)
        {
            return content;
        }

        let regexpProp = null;
        if (extraProperty)
        {
            regexpProp = new RegExp(extraProperty, "g");
        }

        let counter = 0;
        for (const match of matches)
        {
            const tag = match[0].toLowerCase();
            if (extraProperty)
            {
                regexpProp = new RegExp(extraProperty, "g");
                if (!(regexpProp.test(tag)))
                {
                    continue;
                }
            }

            const uri = match[1];
            const replacement = `${category}(${counter}, ${uri})`;

            const added = addEntity(category, {tag, uri, replacement}, referenceDir);
            if (!added)
            {
                continue;
            }

            content = content.replace(tag, replacement);
        }

        return content;
    }
    catch (e)
    {
        console.error({lid: 1013}, e.message);
    }

    return content;
};


const addMinExtension = (uri) =>
{
    try
    {
        const info = path.parse(uri);
        const newBaseName = info.name + ".min" + info.ext;

        const index = uri.lastIndexOf(info.base);
        uri = uri.substring(0, index) + newBaseName + uri.substring(index + info.base.length);

        return uri;
    }
    catch (e)
    {
        console.error({lid: 1013}, e.message);
    }

    return uri;

};


const replaceLast = (str, search, replace) =>
{
    try
    {
        const index = str.lastIndexOf(search);
        str = str.substring(0, index) + replace + str.substring(index + search.length);
        return str;
    }
    catch (e)
    {
        console.error({lid: 1015}, e.message);
    }

    return str;
};

const makePathRelative = (newUri) =>
{
    try
    {
        if (path.isAbsolute(newUri))
        {
            newUri = "." + newUri;
        }
        else
        {
            if (!newUri.startsWith("./"))
            {
                newUri = "./" + newUri;
            }
        }

        return newUri;
    }
    catch (e)
    {
        console.error({lid: 1017}, e.message);
    }

    return newUri;
};

const updateHtml = (htmlContent, {entity, minifiedUri = null, targetBase}) =>
{
    try
    {
        let {uri, tag, replacement} = entity;
        const originalUri = uri;
        uri = makePathRelative(uri);

        if (minifiedUri)
        {
            uri = replaceLast(uri, targetBase, minifiedUri);
        }

        let newTag = replaceLast(tag, originalUri, uri);
        htmlContent = htmlContent.replace(replacement, newTag);
    }
    catch (e)
    {
        console.error({lid: 1021}, e.message);
    }

    return htmlContent;
};

const reportResult = ({sourcemaps = false, minified = false, bundled = false, entity} = {}) =>
{
    try
    {
        const properties = [];
        if (bundled)
        {
            properties.push("bundled");
        }

        if (minified)
        {
            properties.push("minified");
        }

        if (sourcemaps)
        {
            properties.push("source mapped");
        }

        let str = "";
        if (properties.length)
        {
            str = properties.join(", ") + " and ";
        }

        let sentence = `${str}copied ${entity.uri}`;
        sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
        console.log(sentence);

        return true;
    }
    catch (e)
    {
        console.error({lid: 1023}, e.message);
    }

    return false;
};

/**
 * Minify css file using cleanCss to do the minifying
 * @param solvedSourceAbsolutePath
 * @param htmlContent
 * @param sourcemaps
 * @param targetDir
 * @param targetName
 * @param targetBase
 * @param uriProp
 * @returns {null|{content: string, htmlContent: *}}
 */
const minifyCss = (solvedSourceAbsolutePath, {
    htmlContent,
    sourcemaps = false,
    targetDir,
    targetName,
    targetBase,
    entity
} = {}) =>
{
    try
    {
        const cssMinifyingOptions = {};
        if (sourcemaps)
        {
            cssMinifyingOptions.sourceMap = true;
            cssMinifyingOptions.rebaseTo = targetDir;
        }

        let content = "";

        const originalContent = fs.readFileSync(solvedSourceAbsolutePath, "utf-8");

        // ------------
        const referenceDir = path.parse(solvedSourceAbsolutePath).dir;
        extractEntities(originalContent, {
            search       : "url\\([\"']?([^\"']+)[\"']?\\)",
            category     : CATEGORY.GENERIC,
            referenceDir
        });
        // ------------

        const css = new CleanCSS(cssMinifyingOptions).minify(originalContent);

        // css.warnings && css.warnings.length && console.log(css.warnings.join(os.EOL));
        css.errors && css.errors.length && console.log(css.errors.join(os.EOL));

        // CSS minifying was successful
        if (css && css.styles)
        {
            content = css.styles;
        }


        let minifiedUri = targetName + ".min.css";
        const targetPath = joinPath(targetDir, targetName + ".css");
        const targetPathMinified = joinPath(targetDir, minifiedUri);
        if (css.sourceMap)
        {
            const sourcemapPath = joinPath(targetDir, targetName + ".css.map");
            const sourcemapContent = css.sourceMap.toString();

            // Write source map
            fs.writeFileSync(sourcemapPath, sourcemapContent, "utf-8");

            // Write original
            fs.writeFileSync(targetPath, originalContent, "utf-8");

            content = content + os.EOL + `/*# sourceMappingURL=${targetName}.css.map */`;
        }

        // Write minified
        fs.writeFileSync(targetPathMinified, content, "utf-8");

        htmlContent = updateHtml(htmlContent, {entity, minifiedUri, targetBase});

        reportResult({sourcemaps: !!css.sourceMap, minified: true, entity});

        return {content, htmlContent};
    }
    catch (e)
    {
        console.error({lid: 1025}, e.message);
    }

    return null;
};

/**
 * Minify .js using uglify-js to do the minifying
 * @param solvedSourceAbsolutePath
 * @param sourcemaps
 * @param targetDir
 * @param targetName
 * @param uri
 * @returns {{content: string}|null}
 */
const minifyJs = (solvedSourceAbsolutePath, {
    htmlContent,
    sourcemaps = false,
    targetDir,
    targetName,
    targetBase,
    entity
} = {}) =>
{
    try
    {
        let minifiedUri = targetName + ".min.js";
        const targetPath = joinPath(targetDir, targetName + ".js");
        const targetPathMinified = joinPath(targetDir, minifiedUri);
        const sourcemapPath = joinPath(targetDir, targetName + ".js.map");

        const jsMinifyingOptions = {};
        if (sourcemaps)
        {
            jsMinifyingOptions.sourceMap = {
                filename: targetBase,
                url     : targetName + ".js.map"
            };
        }

        const originalContent = fs.readFileSync(solvedSourceAbsolutePath, "utf-8");
        const result = UglifyJS.minify(originalContent, jsMinifyingOptions);

        if (result.error)
        {
            console.error(result.error);
            return null;
        }

        const content = result.code;

        // Write minified
        fs.writeFileSync(targetPathMinified, content, "utf-8");

        if (result.map)
        {
            const sourcemapContent = result.map;

            // Write source map
            fs.writeFileSync(sourcemapPath, sourcemapContent, "utf-8");

            // Write original
            fs.writeFileSync(targetPath, originalContent, "utf-8");
        }

        htmlContent = updateHtml(htmlContent, {entity, minifiedUri, targetBase});

        reportResult({sourcemaps: !!sourcemaps, minified: true, entity});

        return {content, htmlContent};
    }
    catch (e)
    {
        console.error({lid: 1027}, e.message);
    }

    return null;
};

const minifyEsm = async (solvedSourceAbsolutePath, {
    htmlContent,
    sourcemaps = false,
    targetDir,
    targetName,
    targetBase,
    entity
} = {}) =>
{
    try
    {
        let minifiedUri = targetName + ".min.js";
        const targetPathMinified = joinPath(targetDir, minifiedUri);

        const esmOptions = {
            input           : solvedSourceAbsolutePath,
            noheader        : true,
            target          : TARGET.BROWSER,
            onlyBundle      : true,
            "bundle-browser": targetPathMinified,
            keepExternal    : true,
            resolveAbsolute : ["./node_modules"]
        };

        if (sourcemaps)
        {
            esmOptions.sourceMap = true;
        }

        const result = await transpileFiles(esmOptions);
        if (!result.success)
        {
            console.error(`Error during ${entity.uri} minification`);
            return null;
        }

        htmlContent = updateHtml(htmlContent, {entity, minifiedUri, targetBase});

        reportResult({sourcemaps: !!sourcemaps, minified: true, bundled: true, entity});

        return {htmlContent};
    }
    catch (e)
    {
        console.error({lid: 1029}, e.message);
    }

    return null;
};

const copyGeneric = (solvedSourceAbsolutePath, {
    htmlContent,
    targetPath,
    targetBase,
    entity
} = {}) =>
{
    try
    {
        if (solvedSourceAbsolutePath.indexOf("manifest.json") > -1)
        {
            // ------------
            const content = fs.readFileSync(solvedSourceAbsolutePath, "utf-8");
            const referenceDir = path.parse(solvedSourceAbsolutePath).dir;
            extractEntities(content, {
                search       : `"src"\\s*:\\s*"([^"]+)"`,
                category     : CATEGORY.EXTRAS,
                referenceDir
            });
            // ------------
        }

        fs.copyFileSync(solvedSourceAbsolutePath, targetPath);
        htmlContent = updateHtml(htmlContent, {entity, targetBase});
        reportResult({entity});

        return {htmlContent};
    }
    catch (e)
    {
        console.error({lid: 1029}, e.message);
    }

    return null;
};

/**
 * Copy an uri to the target folder
 * @param uri
 * @param entity
 * @param destFolder
 * @param htmlContent
 * @param minify
 * @param entity
 * @param destFolder
 * @param htmlContent
 * @param minify
 * @param sourcemaps
 * @returns {Promise<null|{uri, htmlContent}>}
 */
const copyEntity = async (entity, destFolder, htmlContent, {
    minify = false,
    sourcemaps = false
} = {}) =>
{
    try
    {
        let {uri, category, sourcePath} = entity;

        if (!sourcePath)
        {
            console.error(`Could not find local path for ${uri}`);
            return null;
        }

        // Create target folder
        let targetPath = joinPath(destFolder, uri);
        const infoPath = path.parse(targetPath);
        if (!fs.existsSync(infoPath.dir))
        {
            fs.mkdirSync(infoPath.dir, {recursive: true});
        }

        let res;

        // Minify
        if (minify)
        {
            if (category === CATEGORY.CSS)
            {
                res = minifyCss(sourcePath, {
                    htmlContent,
                    sourcemaps,
                    targetDir : infoPath.dir,
                    targetName: infoPath.name,
                    targetBase: infoPath.base,
                    entity
                });
            }
            else if (category === CATEGORY.SCRIPT)
            {
                res = minifyJs(sourcePath, {
                    htmlContent,
                    sourcemaps,
                    targetDir : infoPath.dir,
                    targetName: infoPath.name,
                    targetBase: infoPath.base,
                    entity
                });
            }
            else if (category === CATEGORY.ESM)
            {
                res = await minifyEsm(sourcePath, {
                    htmlContent,
                    sourcemaps,
                    destFolder,
                    targetDir : infoPath.dir,
                    targetName: infoPath.name,
                    targetBase: infoPath.base,
                    entity
                });
            }
        }
        else
        {
            // CATEGORY.GENERIC, CATEGORY.MEDIAS, CATEGORY.EXTRAS
            res = copyGeneric(sourcePath, {
                htmlContent,
                targetPath,
                targetDir : infoPath.dir,
                targetName: infoPath.name,
                targetBase: infoPath.base,
                entity
            });
        }

        htmlContent = res.htmlContent;

        return {uri, htmlContent};
    }
    catch (e)
    {
        console.error({lid: 1003}, e.message);
    }

    return null;
};

/**
 * Copy an array of uris to the target folder
 * @param uris
 * @param category
 * @param htmlContent
 * @param outputFolder
 * @returns {Promise<string>}
 */
const copyEntities = async (category, outputFolder, {htmlContent = null, minify = false, sourcemaps = false} = {}) =>
{
    try
    {
        const entities = getEntities(category);
        for (let i = 0; i < entities.length; ++i)
        {
            const entity = entities[i];
            const res = await copyEntity(entity, outputFolder, htmlContent, {minify, sourcemaps});

            if (!res)
            {
                console.log(`Failed to copy ${entity.uri} to ${outputFolder}`);
                continue;
            }

            htmlContent = res.htmlContent;
        }
    }
    catch (e)
    {
        console.error({lid: 1005}, e.message);
    }

    return htmlContent;
};

/**
 * Extract CSS and Js url from source
 * @param {string} input
 * @param {string} outputFolder
 * @param minifyHtml
 * @param minifyCss
 * @param minifyJs
 * @param sourcemaps
 * @returns {Promise<string|null>}
 */
const copyAssetsFromHTML = async (input, outputFolder, {
    minifyHtml = false,
    minifyCss = false,
    minifyJs = false,
    sourcemaps = false
} = {}) =>
{
    try
    {
        let htmlContent = fs.readFileSync(input, "utf-8");
        htmlContent = stripHtmlComments(htmlContent);

        if (minifyHtml)
        {
            htmlContent = minifierHtml(htmlContent, {
                collapseWhitespace   : true,
                continueOnParseError : true,
                keepClosingSlash     : true,
                removeAttributeQuotes: false,
                minifyCss,
                minifyJs
            });
        }

        // CSS
        htmlContent = extractEntities(htmlContent, {
            tagName      : "link",
            sourceRefName: "href",
            extraProperty: `\\bstylesheet\\b`,
            category     : CATEGORY.CSS
        });

        // GENERIC
        htmlContent = extractEntities(htmlContent, {
            tagName      : "\\w+",
            sourceRefName: "href",
            category     : CATEGORY.GENERIC
        });

        // ESM
        htmlContent = extractEntities(htmlContent, {
            tagName      : "script",
            sourceRefName: "src",
            extraProperty: `\\btype\\s*?=\\s*?["']\\s*?module\\s*?["']`,
            category     : CATEGORY.ESM
        });

        // SCRIPTS
        htmlContent = extractEntities(htmlContent, {
            tagName      : "script",
            sourceRefName: "src",
            category     : CATEGORY.SCRIPT
        });

        // MEDIAS
        htmlContent = extractEntities(htmlContent, {
            tagName      : "\\w+",
            sourceRefName: "src",
            category     : CATEGORY.MEDIAS
        });

        const referenceDir = path.parse(input).dir;
        extractEntities(htmlContent, {
            search       : "url\\([\"']?([^\"']+)[\"']?\\)",
            category     : CATEGORY.GENERIC,
            referenceDir
        });



        htmlContent = await copyEntities(CATEGORY.CSS, outputFolder, {htmlContent, minify: minifyCss, sourcemaps});
        htmlContent = await copyEntities(CATEGORY.GENERIC, outputFolder, {htmlContent});
        htmlContent = await copyEntities(CATEGORY.MEDIAS, outputFolder, {htmlContent});
        htmlContent = await copyEntities(CATEGORY.ESM, outputFolder, {htmlContent, minify: minifyJs, sourcemaps});
        htmlContent = await copyEntities(CATEGORY.SCRIPT, outputFolder, {htmlContent, minify: minifyJs, sourcemaps});

        // Extra files discovered during process i.e. manifest.json
        await copyEntities(CATEGORY.EXTRAS, outputFolder, {htmlContent});

        return htmlContent;
    }
    catch (e)
    {
        console.error({lid: 1015}, e.message);
    }

    return null;
};

/**
 *
 * @param outputFolder
 * @param inputs
 * @param htmlPath
 * @param minifyHtml
 * @param minifyCss
 * @param minifyJs
 * @param sourcemaps
 * @returns {Promise<boolean>}
 */
const generateBuild = async (outputFolder, htmlPath, {
    minifyHtml = false,
    minifyCss = false,
    minifyJs = false,
    sourcemaps = false
} = {}) =>
{
    try
    {
        fs.mkdirSync(outputFolder, {recursive: true});

        const parsed = path.parse(htmlPath);

        const realOutputFolder = path.isAbsolute(parsed.dir) ? resolvePath(outputFolder) : joinPath(outputFolder, parsed.dir);
        const htmlContent = await copyAssetsFromHTML(htmlPath, realOutputFolder, {
            minifyHtml,
            minifyCss,
            minifyJs,
            sourcemaps
        });

        const targetHtmlPath = joinPath(realOutputFolder, parsed.base);
        fs.writeFileSync(targetHtmlPath, htmlContent, "utf-8");

        return realOutputFolder;
    }
    catch (e)
    {
        console.error({lid: 1017}, e.message);
    }

    return null;
};

const stopServer = async ({namespace = "to-build", name = "staging"} = {}) =>
{
    try
    {
        const isServerUp = await isGenserverUp({namespace, name});
        if (isServerUp)
        {
            return await stopGenServer({namespace, name});
        }
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return false;
};

const startServer = async ({dirs = [], namespace = "to-build", name = "staging", port = 10002, dynDirs = []} = {}) =>
{
    try
    {
        if (!await stopServer({namespace, name}))
        {
            console.error(`Could not stop running server. Re-using the same one`);
        }

        return await startGenServer({namespace, name, port, dirs, dynDirs});
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return false;
};

const startServers = async (realOutputFolder) =>
{
    try
    {
        // Start server for development
        const devDirs = getRoots();
        devDirs.push(...getStaticDirs());
        if (!await startServer({name: "development", dirs: devDirs, dynDirs: ["dynamic"], port: 10000}))
        {
            console.error(`Failed to start the development server`);
        }

        // Start server for staging
        const stagingDirs = [];
        stagingDirs.push(realOutputFolder);
        stagingDirs.push(...getStaticDirs());

        if (!await startServer({name: "staging", dirs: stagingDirs, dynDirs: ["dynamic"], port: 10002}))
        {
            console.error(`Failed to start the staging server`);
        }

        // Start server for production
        const productionDirs = [];
        productionDirs.push(realOutputFolder);
        productionDirs.push(...getStaticDirs());

        if (!await startServer({name: "production", dirs: productionDirs, dynDirs: ["dynamic"], port: 10004}))
        {
            console.error(`Failed to start the production server`);
        }

        return true;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return false;
};

(async function init()
{
    try
    {
        const cli = parseCli(process.argv);

        for (let key in cli)
        {
            const lowerCaseKey = key.toLowerCase();
            if (lowerCaseKey !== key)
            {
                cli[lowerCaseKey] = cli[key];
            }
        }

        // Grab input HTML files
        const inputs = cli._;

        // Grab output folder
        let outputFolder = cli.output || "./out";
        outputFolder = resolvePath(outputFolder);

        let realOutputFolder;

        for (let i = 0; i < inputs.length; ++i)
        {
            const htmlPath = inputs[i];

            console.log(`Building for ${htmlPath}`);

            // Define lookup root folders
            setRoots(htmlPath, cli.root);

            const minifyHtml = getBooleanOptionValue(cli, "minifyHtml", true);
            const minifyCss = getBooleanOptionValue(cli, "minifyCss", true);
            const minifyJs = getBooleanOptionValue(cli, "minifyJs", true);
            const sourcemaps = getBooleanOptionValue(cli, "sourcemaps", true);

            // Copy detected files in HTML source to target folder
            realOutputFolder = await generateBuild(outputFolder, htmlPath, {
                minifyHtml,
                minifyCss,
                minifyJs,
                sourcemaps
            });
        }

        setStaticDirs(cli.static);

        // ---------------------------------------------
        // Start servers
        // ---------------------------------------------
        await startServers(realOutputFolder);

    }
    catch (e)
    {
        console.error({lid: 1021}, e.message);
    }

    return false;

}());