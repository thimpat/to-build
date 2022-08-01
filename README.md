

***

## Name

to-build is a quick build generator

<br/>

## Description

to-build parses an index.html in development and generate a new build from it.

<br/>

## Installation

```shell
$> npm install to-build
```


## Usage


##### Generate builds in the ./out directory with .css and .js minified

###### Two builds generated in two different folders:

`./out/staging` => Contains minified files + sourcemaps

`./out/production` => Contains minified files with no sourcemaps (partially flattened folder)


```shell
$> to-build src/index.html
```

<br/>


## Examples



##### Generate build in a folder called "target"


```shell
$> to-build src/index.html --output target
```

<br/>

##### Generate build with no source map
```shell
$> to-build src/index.html --sourcemaps false
```
<br/>

##### Generate build with non-minified css
```shell
$> to-build src/index.html --minifyCss false
```
<br/>

##### Generate build with non-minified html
```shell
$> to-build src/index.html --minifyHtml false
```

<br/>

##### Generate build with non-minified js
```shell
$> to-build src/index.html --minifyJs false
```

<br/>

##### Generate build only for production

```shell
$> to-build src/index.html --development no --staging no
```

<br/>





