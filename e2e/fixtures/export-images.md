# Images

relative: ![relative](./assets/sample.png)

nested: ![nested](assets/sub/nested.png)

root: ![root](/assets/sample.png)

absolute: ![absolute]({{FIXTURES_DIR}}/assets/sample.png)

remote: ![remote]({{REMOTE_IMAGE_URL}})

srcset: <img alt="srcset" src="assets/sample.png" srcset="assets/sample.png 1x, assets/sub/nested.png 2x">

spaces: ![spaces](<assets/with space.png>)

arabic: ![arabic](<assets/صورة عربية.png>)

svg: ![svg](assets/sample.svg)

missing: ![missing](assets/does-not-exist.png)

## Part

The target of a cross-document link.
