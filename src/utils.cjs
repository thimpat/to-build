const fs = require("fs");
const crypto = require("crypto");

const getHashFromText = (text) =>
{
    try
    {
        const hash = crypto.createHash("sha1");
        hash.setEncoding("hex");
        hash.write(text);
        hash.end();
        const sha1sum = hash.read();
        return sha1sum;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return null;
};

/**
 * Return an uid from a file
 * @param filepath
 * @returns {Promise<unknown>}
 */
const getHashFromFile = (filepath) =>
{
    return new Promise((resolve, reject) =>
    {
        try
        {
            const fd = fs.createReadStream(filepath);
            const hash = crypto.createHash("sha1");
            hash.setEncoding("hex");

            fd.on("end", function ()
            {
                hash.end();
                const uid = hash.read();
                resolve(uid);
            });

            fd.pipe(hash);
        }
        catch (e)
        {
            console.error({lid: 1000}, e.message);
            reject(e);
        }
    });

};

module.exports.getHashFromText = getHashFromText;
module.exports.getHashFromFile = getHashFromFile;