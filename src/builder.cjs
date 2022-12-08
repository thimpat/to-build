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

const {resolvePath, joinPath, sleep} = require("@thimpat/libutils");
const {setRoots, getRoots, setStaticDirs, getStaticDirs, getPathName} = require("./source-finder.cjs");

const CleanCSS = require("clean-css");
const UglifyJS = require("uglify-js");

const {TARGET, transpileFiles} = require("to-esm");

const {CATEGORY, addEntity, addProdCode, getEntities, getCodeTagID} = require("./entity-manager.cjs");
const {startGenServer, stopGenServer, isGenserverUp} = require("genserve");
const {getHashFromFile, getHashFromText} = require("./utils.cjs");
const {MASKS} = require("./constants.cjs");

const {anaLogger} = require("analogger");

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
        if (prop === true || prop === "true")
        {
            return true;
        }

        prop = prop.trim().toLowerCase();

        if (!prop)
        {
            return false;
        }

        return !["false", "no", "none"].includes(prop);
    }
    catch (e)
    {
        console.error({lid: 3000}, e.message);
    }

    return defaultValue;
};

/**
 * Extract uris and tags from the given source code and create some objects from it (ENTITY_TYPE)
 * and add them to two bags (entities[category] and lookup[url])
 * @param {string} content Source code to parse
 * @param {string} search String for the regex that will do the search. The regex must contain
 * one subgroup that points to the url to extract to be valid. When search is defined, the internal
 * generated regex is ignored.
 * @param referenceDir
 * @param {string} tagName Tag to extract the uri source from (can be a regex string)
 * @param {string} sourceRefName Property that contains the uri to register
 * @param {string|null} extraProperty When the tag is detected, we can check whether a property is there to narrow down
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

        for (const match of matches)
        {
            /**
             * Contains the extracted full tag code
             * @example "<link href="./some/paths/some.css" rel="stylesheet" />"
             * @type {string}
             */
            const tag = match[0].toLowerCase();
            if (extraProperty)
            {
                regexpProp = new RegExp(extraProperty, "g");
                if (!(regexpProp.test(tag)))
                {
                    continue;
                }
            }

            /**
             * Contains the url extracted from the tag
             * @example. "<link href="./some/paths/some.css" rel="stylesheet" />"
             * => url = "./some/paths/some.css"
             * @type {string}
             */
            const uri = match[1];
            console.log({lid: 1234, symbol: "black_medium_square"}, `Solving: ${uri}`);

            const added = addEntity(category, {tag, uri}, referenceDir);
            if (!added)
            {
                continue;
            }

            console.log({lid: 1236, symbol: "check"}, `Solved ${uri} with ${added.sourcePath}`);
            content = content.replace(tag, added.replacement);
        }

        return content;
    }
    catch (e)
    {
        console.error({lid: 3002}, e.message);
    }

    return content;
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
        console.error({lid: 3004}, e.message);
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
        console.error({lid: 3006}, e.message);
    }

    return newUri;
};

const decorticatePath = (targetPath) =>
{
    try
    {
        const infoPath = path.parse(targetPath);
        infoPath.filename = getPathName(infoPath.base, {withTrailingSlash: false});
        infoPath.originalPath = targetPath;

        infoPath.path = targetPath;
        if (infoPath.filename !== infoPath.base)
        {
            infoPath.path = joinPath(infoPath.dir, infoPath.filename);
        }
        return infoPath;
    }
    catch (e)
    {
        console.error({lid: 3008}, e.message);
    }

    return false;
};

/**
 * Re-insert the modified code
 * @param htmlContent
 * @param entity
 * @param minifiedUri
 * @returns {*}
 */
const updateHtml = (htmlContent, {entity}) =>
{
    try
    {
        entity.uri = makePathRelative(entity.uri);

        let newTag = replaceLast(entity.tag, entity.originalUri, entity.uri);
        htmlContent = htmlContent.replace(entity.replacement, newTag);
    }
    catch (e)
    {
        console.error({lid: 3010}, e.message);
    }

    return htmlContent;
};

/**
 *
 * @param entity
 * @param destFolder
 * @param {boolean} production Generates a hash id for the file being processed.
 * @param {boolean} minify Rename target
 * @param sourcemaps
 * @returns {Promise<boolean>}
 */
const reviewTargetEntity = async (entity, destFolder, {production = false, minify = false, sourcemaps = false} = {}) =>
{
    try
    {
        if (production)
        {
            let newName = await getHashFromFile(entity.sourcePath);

            const info = path.parse(entity.sourcePath);

            entity.targetName = newName;

            entity.uri = entity.fullname.replace(info.name, newName);
            entity.pathname = entity.uri;

            entity.targetPath = joinPath(destFolder, entity.pathname);

            // Minify here is to let the lines below that targetPath
            // should not be renamed to contain the .min extension.
            // The file is still minified. It just keeps the name which is an id without
            // extras
            minify = false;
        }
        else
        {
            // NOTE: Do not use entity.uri. It may contain special character as normally found in a uri
            // that cannot be translated into a path system.
            entity.targetPath = joinPath(destFolder, entity.pathname);
        }

        const info = decorticatePath(entity.targetPath);
        entity.targetDir = info.dir;
        entity.originalPath = info.originalPath;

        if (minify)
        {
            entity.targetName = entity.name + ".min";
            entity.targetPathUncompressed = entity.targetPath;
            entity.targetPath = replaceLast(entity.targetPath, entity.name, entity.targetName);
            entity.uri = replaceLast(entity.uri, entity.name, entity.targetName);
        }
        else
        {
            entity.targetName = entity.targetName || info.name;
        }

        if (sourcemaps)
        {
            entity.sourcemapName = entity.name + entity.ext + ".map";
            entity.sourcemapPath = joinPath(entity.targetDir, entity.sourcemapName);
        }

        return true;
    }
    catch (e)
    {
        console.error({lid: 3012}, e.message);
    }

    return false;
};

/**
 * Save minification and source maps to disk
 * Restore tags that the entity object has removed during the parsing to the processed source code
 * @param htmlContent
 * @param entity
 * @param alreadyGenerated
 * @param deployImmediately
 * @returns {Promise<null|*>}
 */
const applyChangesFromEntity = async (htmlContent, entity, {alreadyGenerated = false, deployImmediately = true} = {}) =>
{
    try
    {
        // if (!deployImmediately)
        // {
        //     return htmlContent;
        // }

        if (!fs.existsSync(entity.targetDir))
        {
            fs.mkdirSync(entity.targetDir, {recursive: true});
        }

        if (!alreadyGenerated)
        {
            // The .code property contains the minified code
            if (entity.code)
            {
                if (entity.sourcemapContent)
                {
                    // Write source map
                    fs.writeFileSync(entity.sourcemapPath, entity.sourcemapContent, "utf-8");

                    // Write original
                    fs.writeFileSync(entity.targetPathUncompressed, entity.originalContent, "utf-8");
                }

                // Write minified
                fs.writeFileSync(entity.targetPath, entity.code, "utf-8");
            }
            else
            {
                // Copy the corresponding file to its calculated new location
                fs.copyFileSync(entity.sourcePath, entity.targetPath);
            }
        }

        // Restore tags in the html file
        htmlContent = updateHtml(htmlContent, {entity});
        reportResult({entity});
    }
    catch (e)
    {
        console.error({lid: 3014}, e.message);
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
        console.log({lid: 1000}, sentence);

        return true;
    }
    catch (e)
    {
        console.error({lid: 3016}, e.message);
    }

    return false;
};

/**
 * Minify css file using cleanCss to do the minifying
 * @param solvedSourceAbsolutePath
 * @param htmlContent
 * @param sourcemaps
 * @returns {null|{content: string, htmlContent: *}}
 */
const minifyCss = async ({
                             htmlContent,
                             destFolder,
                             sourcemaps = false,
                             entity,
                             production = false
                         } = {}) =>
{
    try
    {
        // Add target information to the entity object
        await reviewTargetEntity(entity, destFolder, {production, minify: true, sourcemaps});

        const cssMinifyingOptions = {};
        if (sourcemaps)
        {
            cssMinifyingOptions.sourceMap = true;
            cssMinifyingOptions.rebaseTo = entity.targetDir;
        }

        entity.originalContent = fs.readFileSync(entity.sourcePath, "utf-8");

        // ------------
        extractEntities(entity.originalContent, {
            search      : "url\\([\"']?([^\"']+)[\"']?\\)",
            category    : CATEGORY.GENERIC,
            referenceDir: entity.sourceDir
        });
        // ------------

        const css = new CleanCSS(cssMinifyingOptions).minify(entity.originalContent);

        // css.warnings && css.warnings.length && console.log({lid: 1002}, css.warnings.join(os.EOL));
        css.errors && css.errors.length && console.log({lid: 1004}, css.errors.join(os.EOL));

        // CSS minifying was successful
        if (css && css.styles)
        {
            entity.code = css.styles;
        }

        if (production)
        {
            addProdCode({entity});
        }
        else
        {
            if (css.sourceMap)
            {
                entity.sourcemapContent = css.sourceMap.toString();
                entity.code = entity.code + os.EOL + `/*# sourceMappingURL=${entity.sourcemapName} */`;
            }
        }

        htmlContent = await applyChangesFromEntity(htmlContent, entity, {deployImmediately: !production});

    }
    catch (e)
    {
        console.error({lid: 3018}, e.message);
    }

    return {htmlContent};
};

/**
 * Minify .js using uglify-js to do the minifying
 * @param solvedSourceAbsolutePath
 * @param sourcemaps
 * @returns {{content: string}|null}
 */
const minifyJs = async ({
                            htmlContent,
                            destFolder,
                            sourcemaps = false,
                            entity,
                            production = false
                        } = {}) =>
{
    try
    {
        // Add target information to the entity object
        await reviewTargetEntity(entity, destFolder, {production, minify: true, sourcemaps});

        const jsMinifyingOptions = {};
        if (sourcemaps)
        {
            jsMinifyingOptions.sourceMap = {
                filename: entity.fullname,
                url     : entity.sourcemapName
            };
        }

        entity.originalContent = fs.readFileSync(entity.sourcePath, "utf-8");
        const result = UglifyJS.minify(entity.originalContent, jsMinifyingOptions);

        if (result.error)
        {
            console.error({lid: 3020}, result.error);
            return null;
        }

        entity.code = result.code;

        if (production)
        {
            addProdCode({content: entity.code, entity});
        }
        else
        {
            if (result.map)
            {
                entity.sourcemapContent = result.map;
            }
        }

        htmlContent = await applyChangesFromEntity(htmlContent, entity, {deployImmediately: !production});

    }
    catch (e)
    {
        console.error({lid: 3022}, e.message);
    }

    return {htmlContent};
};

const minifyEsm = async ({
                             htmlContent,
                             destFolder,
                             sourcemaps = false,
                             entity,
                             production = false
                         } = {}) =>
{
    try
    {
        // Add target information to the entity object
        await reviewTargetEntity(entity, destFolder, {production, minify: true, sourcemaps});

        const esmOptions = {
            input           : entity.sourcePath,
            noheader        : true,
            target          : TARGET.BROWSER,
            onlyBundle      : true,
            "bundle-browser": entity.targetPath,
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
            console.error({lid: 3024}, `Error during ${entity.uri} minification`);
            return null;
        }

        htmlContent = await applyChangesFromEntity(htmlContent, entity, {alreadyGenerated: true});
    }
    catch (e)
    {
        console.error({lid: 3026}, e.message);
    }

    return {htmlContent};
};

const copyGeneric = async ({
                               htmlContent,
                               destFolder,
                               entity
                           } = {}) =>
{
    try
    {
        // Add target information to the entity object
        await reviewTargetEntity(entity, destFolder);

        if (entity.sourcePath.indexOf("manifest.json") > -1)
        {
            // ------------
            const content = fs.readFileSync(entity.sourcePath, "utf-8");
            extractEntities(content, {
                search      : `"src"\\s*:\\s*"([^"]+)"`,
                category    : CATEGORY.EXTRAS,
                referenceDir: entity.sourceDir
            });
            htmlContent = await applyChangesFromEntity(htmlContent, entity);
            // ------------
        }

        if (!["manifest.json"].includes(entity.fullname))
        {
            htmlContent = await applyChangesFromEntity(htmlContent, entity);
        }

        return {htmlContent};
    }
    catch (e)
    {
        console.error({lid: 3028}, e.message);
    }

    return null;
};

/**
 * Process an entity object to generate their target on disk after minification,
 * then restore back the modified part from the processed source
 * @param uri
 * @param {ENTITY_TYPE} entity
 * @param destFolder
 * @param htmlContent
 * @param minify
 * @param destFolder
 * @param htmlContent
 * @param minify
 * @param sourcemaps
 * @returns {Promise<null|{uri, htmlContent}>}
 */
const copyEntity = async (entity, destFolder, htmlContent, {
    minify = false,
    sourcemaps = false,
    production = false
} = {}) =>
{
    try
    {
        let res;

        // Minify
        if (minify)
        {
            if (entity.category === CATEGORY.CSS)
            {
                res = await minifyCss({
                    htmlContent,
                    destFolder,
                    sourcemaps,
                    entity,
                    production
                });
            }
            else if (entity.category === CATEGORY.SCRIPT)
            {
                res = await minifyJs({
                    htmlContent,
                    destFolder,
                    sourcemaps,
                    entity,
                    production
                });
            }
            else if (entity.category === CATEGORY.ESM)
            {
                res = await minifyEsm({
                    htmlContent,
                    destFolder,
                    sourcemaps,
                    entity,
                    production
                });
            }
        }
        else
        {
            // CATEGORY.GENERIC, CATEGORY.MEDIAS, CATEGORY.EXTRAS
            res = await copyGeneric({
                htmlContent,
                destFolder,
                entity,
                production
            });
        }

        htmlContent = res.htmlContent;

    }
    catch (e)
    {
        console.error({lid: 3030}, e.message);
    }

    return {htmlContent};
};

/**
 * Parse the list of saved entities objects to minify their targets and save them on disk,
 * then restore the modified part from the processed string
 * @param uris
 * @param category
 * @param htmlContent
 * @param outputFolder
 * @returns {Promise<string>}
 */
const copyEntities = async (category, outputFolder, {
    htmlContent = null,
    minify = false,
    sourcemaps = false,
    production = false
} = {}) =>
{
    try
    {
        const entities = getEntities(category);
        for (let i = 0; i < entities.length; ++i)
        {
            const entity = entities[i];
            const res = await copyEntity(entity, outputFolder, htmlContent, {minify, sourcemaps, production});

            if (!res)
            {
                console.log({lid: 1006}, `Failed to copy ${entity.uri} to ${outputFolder}`);
                continue;
            }

            htmlContent = res.htmlContent;
        }
    }
    catch (e)
    {
        console.error({lid: 3032}, e.message);
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
 * @param production
 * @returns {Promise<string|null>}
 */
const copyAssetsFromHTML = async (input, outputFolder, {
    minifyHtml = false,
    minifyCss = false,
    minifyJs = false,
    sourcemaps = false,
    buildType,
    production = false
} = {}) =>
{
    try
    {
        let htmlContent = fs.readFileSync(input, "utf-8");
        htmlContent = reviewHTML(htmlContent, buildType);
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

        // INLINE CSS
        const referenceDir = path.parse(input).dir;
        extractEntities(htmlContent, {
            search  : "url\\([\"']?([^\"']+)[\"']?\\)",
            category: CATEGORY.GENERIC,
            referenceDir
        });


        htmlContent = await copyEntities(CATEGORY.CSS, outputFolder, {
            htmlContent,
            minify: minifyCss,
            sourcemaps,
            production
        });

        htmlContent = await copyEntities(CATEGORY.GENERIC, outputFolder, {htmlContent, production});
        htmlContent = await copyEntities(CATEGORY.MEDIAS, outputFolder, {htmlContent, production});

        htmlContent = await copyEntities(CATEGORY.ESM, outputFolder, {
            htmlContent,
            minify: minifyJs,
            sourcemaps,
            production
        });

        htmlContent = await copyEntities(CATEGORY.SCRIPT, outputFolder, {
            htmlContent,
            minify: minifyJs,
            sourcemaps,
            production
        });

        // Extra files discovered during process i.e. manifest.json
        await copyEntities(CATEGORY.EXTRAS, outputFolder, {htmlContent, production});

        return htmlContent;
    }
    catch (e)
    {
        console.error({lid: 3034}, e.message);
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
 * @returns {Promise<{outputFolder: (*), htmlContent: (string|null)}>}
 */
const generateBuild = async (outputFolder, htmlPath, {
    minifyHtml = false,
    minifyCss = false,
    minifyJs = false,
    sourcemaps = false,
    buildType = "staging"
} = {}) =>
{
    try
    {
        fs.mkdirSync(outputFolder, {recursive: true});

        const parsed = path.parse(htmlPath);

        if (buildType === "production")
        {
            minifyCss = true;
            minifyJs = true;
            sourcemaps = false;
        }
        else
        {
            outputFolder = path.isAbsolute(parsed.dir) ? resolvePath(outputFolder) : joinPath(outputFolder, parsed.dir);
        }

        const htmlContent = await copyAssetsFromHTML(htmlPath, outputFolder, {
            minifyHtml,
            minifyCss,
            minifyJs,
            sourcemaps,
            buildType,
            production: buildType === "production"
        });

        return {outputFolder, htmlContent};
    }
    catch (e)
    {
        console.error({lid: 3036}, e.message);
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
        console.error({lid: 3038}, e.message);
    }

    return false;
};

/**
 * Start server
 * @param dirs
 * @param namespace
 * @param name
 * @param port
 * @param dynDirs
 * @param noserver
 * @returns {Promise<*>}
 */
const startServer = async ({
                               dirs = [],
                               namespace = "to-build",
                               name = "staging",
                               port = 10002,
                               dynDirs = [],
                               noserver = false
                           } = {}) =>
{
    try
    {
        if (noserver)
        {
            return true;
        }

        if (!await stopServer({namespace, name}))
        {
            console.error({lid: 3040}, `Could not stop running server. Re-using the same one`);
        }

        const res = await startGenServer({namespace, name, port, dirs, dynDirs, args: ["--open"]});
        await sleep(1000);

        return res;
    }
    catch (e)
    {
        console.error({lid: 3042}, e.message);
    }

    return false;
};

/**
 * Start development server
 * @returns {Promise<boolean>}
 */
const startDevelopmentServer = async ({port = 10000, noserver = false} = {}) =>
{
    try
    {
        // Start server for development
        const devDirs = getRoots();
        devDirs.push(...getStaticDirs());
        if (!await startServer({name: "development", dirs: devDirs, dynDirs: ["dynamic"], port, noserver}))
        {
            console.error({lid: 3044}, `Failed to start the development server`);
        }
        return true;
    }
    catch (e)
    {
        console.error({lid: 3046}, e.message);
    }

    return false;
};

/**
 * Start staging server
 * @param realOutputFolder
 * @param port
 * @param noserver
 * @returns {Promise<boolean>}
 */
const startStagingServer = async (realOutputFolder, {port = 10002, noserver = false} = {}) =>
{
    try
    {
        // Start server for staging
        const stagingDirs = [];
        stagingDirs.push(realOutputFolder);
        stagingDirs.push(...getStaticDirs());

        if (!await startServer({name: "staging", dirs: stagingDirs, dynDirs: ["dynamic"], port, noserver}))
        {
            console.error({lid: 3048}, `Failed to start the staging server`);
        }
        return true;
    }
    catch (e)
    {
        console.error({lid: 3050}, e.message);
    }

    return false;
};

/**
 * Start production server
 * @param realOutputFolder
 * @param port
 * @param noserver
 * @returns {Promise<boolean>}
 */
const startProductionServer = async (realOutputFolder, {port = 10004, noserver = false} = {}) =>
{
    try
    {
        // Start server for production
        const productionDirs = [];
        productionDirs.push(realOutputFolder);
        productionDirs.push(...getStaticDirs());

        if (!await startServer({name: "production", dirs: productionDirs, dynDirs: ["dynamic"], port, noserver}))
        {
            console.error({lid: 3052}, `Failed to start the production server`);
        }

        return true;
    }
    catch (e)
    {
        console.error({lid: 3054}, e.message);
    }

    return false;
};

const generateTag = (entitiesSpecificsList, outputFolder) =>
{
    try
    {
        const currentCategory = entitiesSpecificsList[0].category;
        const extension = entitiesSpecificsList[0].ext;

        let bigCode = "";
        for (let i = 0; i < entitiesSpecificsList.length; ++i)
        {
            const specificEntity = entitiesSpecificsList[i];

            bigCode += `/** ${specificEntity.pathname} */` + os.EOL;

            if (!specificEntity.code)
            {
                // Empty css
                continue;
            }

            bigCode += specificEntity.code + os.EOL + os.EOL + os.EOL;
        }

        const hash = getHashFromText(bigCode);
        const filename = hash + extension;
        const filepath = joinPath(outputFolder, filename);
        fs.writeFileSync(filepath, bigCode, "utf-8");

        if (currentCategory === CATEGORY.CSS)
        {
            return `<link rel="stylesheet" href="./${filename}"/>`;
        }
        if (currentCategory === CATEGORY.SCRIPT)
        {
            return `<script src="./${filename}"></script>`;
        }

        return `<link href="./${filename}"/> <!-- Unknown category -->`;
    }
    catch (e)
    {
        console.error({lid: 3056}, e.message);
    }

    return null;
};

const buildProductionTargets = ({outputFolder, htmlContent}) =>
{
    try
    {
        const htmlParts = htmlContent.split(MASKS.DELIMITER);

        let newHtml = "";
        let entitiesSpecificsList = [];
        let currentCategory = null;
        for (let i = 0; i < htmlParts.length; ++i)
        {
            let htmlPart = htmlParts[i];
            htmlPart = htmlPart.trim();

            if (!htmlPart)
            {
                continue;
            }

            const entity = getCodeTagID(htmlPart);
            if (!entity)
            {
                if (entitiesSpecificsList.length)
                {
                    newHtml += generateTag(entitiesSpecificsList, outputFolder);
                    entitiesSpecificsList = [];
                }

                newHtml += htmlPart;
                continue;
            }

            if (!currentCategory)
            {
                // Reset category
                entitiesSpecificsList = [];
                entitiesSpecificsList.push(entity);
                currentCategory = entity.category;
                continue;
            }

            if (entity.category !== currentCategory)
            {
                newHtml += generateTag(entitiesSpecificsList, outputFolder);

                // Reset category
                entitiesSpecificsList = [];
                entitiesSpecificsList.push(entity);
                currentCategory = entity.category;
                continue;
            }

            entitiesSpecificsList.push(entity);
        }

        return newHtml;
    }
    catch (e)
    {
        console.error({lid: 3057}, e.message);
    }

    return null;
};

function reviewHTML(htmlContent, buildType)
{
    try
    {
        const startComment = `<!--\\s*to-build\\s+remove\\s+${buildType}\\s*-->`;
        const endComment = `<!--\\s*\\/to-build\\s+remove\\s+${buildType}\\s*-->`;

        const regex = new RegExp(`${startComment}.*${endComment}`, "gis");
        const stripped = htmlContent.replace(regex, "");
        if (stripped !== htmlContent)
        {
            console.log(`to-build directive applied`);
        }
        return stripped;
    }
    catch (e)
    {
        console.error({lid: 3059}, e.message);
    }

    return htmlContent
}

/**
 * Generate build for passed HTML files
 * @param inputs
 * @param root
 * @param outputFolder
 * @param minifyHtml
 * @param minifyCss
 * @param minifyJs
 * @param sourcemaps
 * @param isProduction
 * @param noserver
 * @returns {Promise<{outputFolder: *, htmlContent: (string|null)}|null>}
 */
const generateAllHTMLs = async (inputs, {
    root,
    outputFolder,
    minifyHtml,
    minifyCss,
    minifyJs,
    sourcemaps,
    isProduction = false,
    noserver = false
}) =>
{
    try
    {
        const buildType = isProduction ? "production" : "staging";
        outputFolder = path.join(outputFolder, buildType);
        let result;

        for (let i = 0; i < inputs.length; ++i)
        {
            const htmlPath = inputs[i];

            console.log({lid: 1008}, `Building ${buildType} for ${htmlPath}`);

            // Add the index.html file directory to the lookup root list
            const htmlInfo = path.parse(htmlPath);
            let htmlPathFolder = htmlInfo.dir;
            if (htmlPathFolder)
            {
                htmlPathFolder = resolvePath(htmlPathFolder);
            }

            // Define lookup root folders
            setRoots(htmlPathFolder, root);

            // Copy detected files in HTML source to target folder
            result = await generateBuild(outputFolder, htmlPath, {
                minifyHtml,
                minifyCss,
                minifyJs,
                sourcemaps,
                buildType
            });

            result.htmlContent = reviewHTML(result.htmlContent, buildType);

            const targetHtmlPath = joinPath(result.outputFolder, htmlInfo.base);
            if (isProduction)
            {

                fs.writeFileSync(targetHtmlPath, result.htmlContent, "utf-8");
                result.htmlContent = buildProductionTargets(result);
                continue;
            }

            fs.writeFileSync(targetHtmlPath, result.htmlContent, "utf-8");

        }

        // ---------------------------------------------
        // Start servers
        // ---------------------------------------------
        if (buildType === "staging")
        {
            await startStagingServer(result.outputFolder, {noserver});
        }
        else if (buildType === "production")
        {
            await startProductionServer(outputFolder, {noserver});
        }

        return result;
    }
    catch (e)
    {
        console.error({lid: 3060}, e.message);
    }

    return null;
};

(async function init()
{
    try
    {
        anaLogger.setOptions({silent: false, hideError: false, hideHookMessage: true, lidLenMax: 4});
        anaLogger.overrideConsole({});
        anaLogger.overrideError();
        anaLogger.setDefaultContext({color: "#a4985e"});

        console.keepLogHistory();

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

        if (!fs.existsSync(outputFolder))
        {
            fs.mkdirSync(outputFolder, {recursive: true});
        }

        // Grab minify options
        const minifyHtml = getBooleanOptionValue(cli, "minifyHtml", true);
        const minifyCss = getBooleanOptionValue(cli, "minifyCss", true);
        const minifyJs = getBooleanOptionValue(cli, "minifyJs", true);
        const sourcemaps = getBooleanOptionValue(cli, "sourcemaps", true);
        let development = getBooleanOptionValue(cli, "development", false);
        let staging = getBooleanOptionValue(cli, "staging", false);
        let production = getBooleanOptionValue(cli, "production", false);
        const noserver = getBooleanOptionValue(cli, "noserver", false);
        const all = getBooleanOptionValue(cli, "all", false);

        if (!(development || staging || production))
        {
            staging = true;
        }

       if (all)
        {
            development = staging = production = true;
        }

        const root = cli.root;

        setStaticDirs(cli.static);

        if (development)
        {
            setRoots(null, root);
            await startDevelopmentServer({noserver});
        }

        if (staging)
        {
            await generateAllHTMLs(inputs, {
                root,
                outputFolder,
                minifyHtml,
                minifyCss,
                minifyJs,
                sourcemaps,
                isProduction: false,
                buildType: "staging",
                noserver
            });
        }

        if (production)
        {
            await generateAllHTMLs(inputs, {
                root,
                outputFolder,
                minifyHtml,
                minifyCss,
                minifyJs,
                sourcemaps,
                buildType: "production",
                isProduction: true,
                noserver
            });
        }

    }
    catch (e)
    {
        console.error({lid: 3062}, e.message);
    }

    return false;

}());