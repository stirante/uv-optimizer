let button;

(function () {
    // Plugin information
    const id = "uv_optimizer";
    const name = "UV Optimizer";
    const icon = "fa-th";
    const author = "MCNeteaseDevs";
    const description =
        "Automatically optimize UVs: supports gap settings, merges similar faces, and intelligently compresses textures";

    // Register plugin
    var plugin = {
        id,
        name,
        icon,
        author,
        description,
        version: "1.0.0",
        variant: "both",
        onload() {
            // Register main menu button
            button = new Action("optimize_uv", {
                name: "UV Optimize",
                icon: icon,
                category: "edit",
                click: function () {
                    showDialog();
                },
            });
            MenuBar.addAction(button, "tools");
        },
        onunload() {
            button.delete();
        },
    };

    // Show settings dialog
    function showDialog() {
        var dialog = new Dialog({
            id: "uv_optimizer_settings",
            title: "UV Optimization Settings",
            width: 400,
            buttons: ["Confirm", "Cancel"],
            form: {
                gap: {
                    label: "Gap between faces (pixels)",
                    type: "number",
                    value: 0,
                    min: 0,
                    max: 10,
                },
                similarity: {
                    label: "Pixel similarity threshold (%)",
                    type: "number",
                    value: 90,
                    min: 50,
                    max: 100,
                },
                ignoreEffectPixelPercent: {
                    label: "Ignore faces below valid pixel (%)",
                    type: "number",
                    value: 1,
                    min: 0,
                    max: 100,
                },
                downsizeThreshold: {
                    label: "Texture downsize similarity threshold (%)",
                    type: "number",
                    value: 90,
                    min: 50,
                    max: 100,
                },
                padding: {
                    label: "Padding (pixels)",
                    type: "number",
                    value: 0,
                    min: 0,
                    max: 5,
                },
                checkFlip: { label: "Check flip", type: "checkbox", value: true },
                square: { label: "Equal width and height", type: "checkbox", value: false },
                onlyRearrange: { label: "Rearrange only", type: "checkbox", value: false },
            },
            onConfirm: function (formData) {
                optimizeUV(formData);
            },
        });
        dialog.show();
    }

    // Main optimization function
    function optimizeUV(settings) {
        // Ensure there is an active model
        if (!Project || !Project.elements || Project.elements.length === 0) {
            Blockbench.showMessageBox({
                title: "Error",
                message: "No model elements available",
                icon: "error",
            });
            return;
        }

        if (!Texture.all || Texture.all.length === 0) {
            Blockbench.showMessageBox({
                title: "Error",
                message: "No textures available",
                icon: "error",
            });
            return;
        }

        Undo.initEdit({ elements: Project.elements, uv_only: true });

        try {
            Blockbench.showQuickMessage("Optimizing UV...", 2000);

            // Step 1: collect all faces and analyze their textures
            let allFaces = collectFaces(settings.ignoreEffectPixelPercent / 100);

            // Step 2: optimize texture size for each face group
            optimizeTextureSize(allFaces, settings.downsizeThreshold, settings.onlyRearrange);

            // Step 3: group faces by similarity
            let faceGroups = groupSimilarFaces(
                allFaces,
                settings.similarity,
                settings.checkFlip,
                settings.onlyRearrange
            );

            // Step 4: rearrange UVs
            rearrangeUV(faceGroups, settings.gap, settings.padding, settings.square);

            Blockbench.showQuickMessage("UV optimization complete!", 2000);
        } catch (e) {
            console.error(e);
            Blockbench.showMessageBox({
                title: "Error",
                message: "UV optimization failed: " + e.message,
                icon: "error",
            });
        }

        Undo.finishEdit("Optimize UV");
        Canvas.updateView({
            elements: Project.elements,
            element_aspects: { uv: true },
        });
    }

    // Collect all faces
    function collectFaces(ignorePixelPercent) {
        let faces = [];
        Project.elements.forEach((element) => {
            if (element.type === "cube") {
                for (let faceKey in element.faces) {
                    let face = element.faces[faceKey];
                    if (face.uv) {
                        faces.push({
                            element: element,
                            faceKey: faceKey,
                            face: face,
                            textureData: getTextureData(face, ignorePixelPercent),
                        });
                    }
                }
            }
        });

        return faces;
    }

    // Get face texture data
    function getTextureData(face, ignorePixelPercent) {
        if (Texture.all.length <= 0) return null;
        let texture = Texture.all[0];
        if (face.texture)
            texture = Texture.all.find((t) => t.uuid === face.texture);
        if (!texture || !texture.img) return null;

        const scaleW = texture.width / Project.texture_width;
        const scaleH = texture.height / Project.texture_height;

        // Get pixel data in the UV area
        let uvX1 = (face.uv[0]);
        let uvY1 = (face.uv[1]);
        let uvX2 = (face.uv[2]);
        let uvY2 = (face.uv[3]);

        let width = uvX2 - uvX1;
        let height = uvY2 - uvY1;

        if (width == 0 || height == 0) {
            return { texture, width: 0, height: 0, data: null };
        }
        let canvasTemp = document.createElement("canvas");
        let ctxTemp = canvasTemp.getContext("2d");
        canvasTemp.width = Math.abs(width * scaleW);
        canvasTemp.height = Math.abs(height * scaleH);
        if (canvasTemp.width < 1 || canvasTemp.height < 1) {
            return { texture, width: 0, height: 0, data: null };
        }
        ctxTemp.drawImage(
            texture.img,
            uvX1 * scaleW,
            uvY1 * scaleH,
            width * scaleW,
            height * scaleH,
            0,
            0,
            canvasTemp.width,
            canvasTemp.height,
        );
        // Get image data in the UV area
        let imageData = ctxTemp.getImageData(0, 0, canvasTemp.width, canvasTemp.height);
        let valid = 0;
        let pixelTotal = imageData.data.length / 4;
        for (let i = 0; i < pixelTotal; i++) {
            let a = imageData.data[i * 4 + 3];
            if (a > 0) valid += 1;
        }
        if (valid / pixelTotal < ignorePixelPercent) {
            return { texture, width: 1, height: 1, data: null };
        }
        return {
            texture: texture,
            width: width,
            height: height,
            scaleW,
            scaleH,
            data: imageData.data,
            original: {
                canvas: canvasTemp,
                canvasCtx: ctxTemp,
                uvX1,
                uvY1,
                uvX2,
                uvY2,
                width,
                height,
            },
        };
    }

    // Group faces based on similarity
    function groupSimilarFaces(faces, similarityThreshold, checkFlip, onlyRearrange) {
        let groups = [];

        faces.forEach((face) => {
            // Skip faces without valid texture data
            if (!face.textureData || !face.textureData.data) {
                groups.push([face]);
                return;
            }

            let foundGroup = false;
            let similarityScore = similarityThreshold / 100; // convert to a value between 0 and 1
            if (!onlyRearrange) {
                // For each group, check if the face is similar to the first face
                for (let i = 0; i < groups.length; i++) {
                    let group = groups[i];
                    let reference = group[0];

                    // Skip reference faces without valid texture data
                    if (!reference.textureData || !reference.textureData.data) {
                        continue;
                    }

                    // Check if dimensions match before comparing
                    if (
                        Math.abs(face.optimizedSize.width) !== Math.abs(reference.optimizedSize.width) ||
                        Math.abs(face.optimizedSize.height) !== Math.abs(reference.optimizedSize.height)
                    ) {
                        continue;
                    }

                    let result = areSimilar(
                        face,
                        reference,
                        similarityScore,
                        checkFlip
                    );
                    if (result.similar) {
                        console.log(`Similarity optimize ${result.similarity.toFixed(2)} ${result.flipped}`);
                        face.flipped = result.flipped;
                        face.rotated = result.rotated;
                        group.push(face);
                        foundGroup = true;
                        break;
                    }
                }
            }

            // If no similar group is found, create a new group
            if (!foundGroup) {
                face.flipped = false;
                face.rotated = 0;
                groups.push([face]);
            }
        });

        return groups;
    }

    // Check whether two faces are similar
    function areSimilar(face1, face2, threshold, checkFlip) {
        const textureData1 = face1.textureData;
        const textureData2 = face2.textureData;
        if (!textureData1.data || !textureData2.data) {
            return { similar: false };
        }

        const width = Math.abs(face1.optimizedSize.width);
        const height = Math.abs(face1.optimizedSize.height);
        const pixelData1 = face1.optimizedSize.data;
        const pixelData2 = face2.optimizedSize.data;

        // Check normal similarity
        let normalSimilarity = calculateSimilarity(
            pixelData1,
            pixelData2,
        );
        if (normalSimilarity >= threshold) {
            return { similar: true, flipped: false, rotated: 0, similarity: normalSimilarity };
        }

        // If flip checking is required
        if (checkFlip) {
            // Horizontal flip
            let horizontalFlipped = new Uint8ClampedArray(pixelData1.length);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let srcPos = (y * width + x) * 4;
                    let dstPos = (y * width + (width - 1 - x)) * 4;
                    for (let c = 0; c < 4; c++) {
                        horizontalFlipped[dstPos + c] = pixelData1[srcPos + c];
                    }
                }
            }
            let hFlipSimilarity = calculateSimilarity(
                horizontalFlipped,
                pixelData2,
            );
            if (hFlipSimilarity >= threshold) {
                return { similar: true, flipped: "horizontal", rotated: 0, similarity: hFlipSimilarity };
            }

            // Vertical flip
            let verticalFlipped = new Uint8ClampedArray(pixelData1.length);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let srcPos = (y * width + x) * 4;
                    let dstPos = ((height - 1 - y) * width + x) * 4;
                    for (let c = 0; c < 4; c++) {
                        verticalFlipped[dstPos + c] = pixelData1[srcPos + c];
                    }
                }
            }
            let vFlipSimilarity = calculateSimilarity(
                verticalFlipped,
                pixelData2,
            );
            if (vFlipSimilarity >= threshold) {
                return { similar: true, flipped: "vertical", rotated: 0, similarity: vFlipSimilarity };
            }

            // Horizontal + vertical flip (180-degree rotation)
            let bothFlipped = new Uint8ClampedArray(pixelData1.length);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let srcPos = (y * width + x) * 4;
                    let dstPos = ((height - 1 - y) * width + (width - 1 - x)) * 4;
                    for (let c = 0; c < 4; c++) {
                        bothFlipped[dstPos + c] = pixelData1[srcPos + c];
                    }
                }
            }
            let bothFlipSimilarity = calculateSimilarity(
                bothFlipped,
                pixelData2,
            );
            if (bothFlipSimilarity >= threshold) {
                return { similar: true, flipped: "both", rotated: 180, similarity: bothFlipSimilarity };
            }
        }

        return { similar: false };
    }

    // Calculate similarity between two pixel arrays
    function calculateSimilarity(pixelData1, pixelData2, ignoreAlpha = false) {
        let totalPixels = pixelData1.length / 4;
        let matchingPixels = 0;

        // Pixel match threshold (0-255 difference)
        const pixelMatchThreshold = 1; // add some tolerance

        for (let i = 0; i < totalPixels; i++) {
            let pos = i * 4;
            let match = true;
            let valid = pixelData1[pos + 3] * pixelData2[pos + 3] > 0;
            // Check the RGBA channel differences
            for (let c = 0; c < 4; c++) {
                if (
                    Math.abs(pixelData1[pos + c] - pixelData2[pos + c]) >
                    pixelMatchThreshold
                ) {
                    match = false;
                    break;
                }
            }
            if (match) matchingPixels += 1;
        }
        if (totalPixels == 0) return 1;

        return matchingPixels / totalPixels;
    }

    // New: optimize texture size function
    function optimizeTextureSize(faces, similarityThreshold, onlyRearrange) {
        const threshold = onlyRearrange ? 1.1 : similarityThreshold / 100; // convert to a value between 0 and 1

        faces.forEach(face => {
            if (!face.textureData || !face.textureData.data) return;

            const originalData = face.textureData;
            // Canvas of the original texture
            const originalCanvas = originalData.original.canvas;
            const tWidth = originalCanvas.width;
            const tHeight = originalCanvas.height;

            // Get the original pixel data
            const originalPixelData = originalData.data;

            // Initialize best size and current size
            let bestWidth = tWidth;
            let bestHeight = tHeight;
            let currentWidth = tWidth;
            let currentHeight = tHeight;

            let smallCanvas = document.createElement('canvas');
            let smallCtx = smallCanvas.getContext('2d', { willReadFrequently: true });
            smallCanvas.width = currentWidth;
            smallCanvas.height = currentHeight;
            smallCtx.imageSmoothingEnabled = false;

            let upscaledCanvas = document.createElement('canvas');
            let upscaledCtx = upscaledCanvas.getContext('2d', { willReadFrequently: true });
            upscaledCanvas.width = originalCanvas.width;
            upscaledCanvas.height = originalCanvas.height;
            upscaledCtx.imageSmoothingEnabled = false;

            let bestData = originalPixelData;

            // Gradually halve the size and check similarity
            while (currentWidth > 1 || currentHeight > 1) {
                smallCtx.clearRect(0, 0, smallCanvas.width, smallCanvas.height);
                // Halve the size
                currentWidth = Math.max(1, Math.floor(currentWidth / 2));
                currentHeight = Math.max(1, Math.floor(currentHeight / 2));

                // Draw the downscaled image
                smallCtx.drawImage(
                    originalCanvas,
                    0, 0,
                    originalCanvas.width, originalCanvas.height,
                    0, 0,
                    currentWidth, currentHeight
                );

                // Create a canvas scaled back to the original size
                upscaledCtx.clearRect(0, 0, upscaledCanvas.width, upscaledCanvas.height);
                // Draw the upscaled image
                upscaledCtx.drawImage(
                    smallCanvas,
                    0, 0,
                    currentWidth, currentHeight,
                    0, 0,
                    upscaledCanvas.width, upscaledCanvas.height
                );

                // Get the scaled-up pixel data
                const upscaledPixelData = upscaledCtx.getImageData(
                    0, 0,
                    upscaledCanvas.width,
                    upscaledCanvas.height
                ).data;

                // Calculate similarity
                const similarity = calculateSimilarity(
                    originalPixelData,
                    upscaledPixelData,
                    onlyRearrange
                );

                // If similarity is below the threshold, use the previous size
                if (similarity < threshold) {
                    break;
                }

                // Update the best size
                bestWidth = currentWidth;
                bestHeight = currentHeight;

                bestData = smallCtx.getImageData(0, 0, currentWidth, currentHeight).data;
            }

            // Store the optimized size
            const optimizedSize = {
                width: bestWidth * Math.sign(originalData.width),
                height: bestHeight * Math.sign(originalData.height),
                data: bestData
            };
            face.optimizedSize = optimizedSize;
            if (tWidth != bestWidth || tHeight != bestHeight) {
                console.log(`Compression optimize: ${tWidth}x${tHeight} -> ${bestWidth}x${bestHeight}`);
            }
        });
    }

    // Rearrange UV
    function rearrangeUV(faceGroups, gap, padding, square) {
        // Get the texture
        const mainTexture = Texture.all[0];
        if (!mainTexture) return;

        // Start from 16x16
        let canvasSize = {
            width: 16,
            height: 16,
        };

        // Calculate the UV space required for each group using the optimized size
        let groupSizes = faceGroups.map((group) => {
            let reference = group[0];
            let size = { width: 0, height: 0 };

            // Use the optimized size if present
            if (reference.optimizedSize) {
                size.width = Math.abs(reference.optimizedSize.width);
                size.height = Math.abs(reference.optimizedSize.height);
            } else if (reference.textureData) {
                size.width = Math.abs(reference.textureData.width);
                size.height = Math.abs(reference.textureData.height);
            } else {
                let faceUV = reference.face.uv;
                size.width = Math.abs(faceUV[2] - faceUV[0]);
                size.height = Math.abs(faceUV[3] - faceUV[1]);
            }

            size.width += padding * 2;
            size.height += padding * 2;

            return {
                width: size.width,
                height: size.height,
                faces: group,
                area: size.width * size.height,
            };
        });

        groupSizes.sort((a, b) => b.area - a.area);

        let success = false;
        let uvPositions = [];
        let r = 0;
        const resize = square ? [2, 2, 2, 2] : [2, 1, 1, 2];

        // Try different canvas sizes until successful
        while (
            !success &&
            canvasSize.width <= mainTexture.width &&
            canvasSize.height <= mainTexture.height
        ) {
            let packer = new RectanglePacker(canvasSize.width, canvasSize.height);
            uvPositions = [];
            success = true;

            for (let i = 0; i < groupSizes.length; i++) {
                let group = groupSizes[i];
                let position = packer.insert(
                    group.width + gap,
                    group.height + gap
                );

                if (position) {
                    uvPositions.push({
                        x: position.x,
                        y: position.y,
                        width: group.width,
                        height: group.height,
                        group: group.faces,
                        padding: padding, // Add padding information
                    });
                } else {
                    success = false;
                    // Double the canvas size
                    canvasSize.width *= resize[r * 2];
                    canvasSize.height *= resize[r * 2 + 1];
                    r = (r + 1) % 2;
                    break;
                }
            }
        }

        Project.texture_width = canvasSize.width;
        Project.texture_height = canvasSize.height;

        // Apply the new UV coordinates
        uvPositions.forEach((position) => {
            let group = position.group;
            group.forEach((faceInfo) => {
                let face = faceInfo.face;
                let offsetX = padding;
                let offsetY = padding;

                // Adjust UV based on rotation and flipping
                let uvWidth = position.width - padding * 2;
                let uvHeight = position.height - padding * 2;

                let uvCoords = [
                    position.x + offsetX,
                    position.y + offsetY,
                    position.x + offsetX + uvWidth,
                    position.y + offsetY + uvHeight,
                ];
                if (faceInfo.textureData.width < 0) {
                    uvCoords[0] += uvWidth;
                    uvCoords[2] -= uvWidth;
                }
                if (faceInfo.textureData.height < 0) {
                    uvCoords[1] += uvHeight;
                    uvCoords[3] -= uvHeight;
                }

                // Apply flipping and rotation
                if (faceInfo.flipped === "horizontal") {
                    [uvCoords[0], uvCoords[2]] = [uvCoords[2], uvCoords[0]];
                } else if (faceInfo.flipped === "vertical") {
                    [uvCoords[1], uvCoords[3]] = [uvCoords[3], uvCoords[1]];
                } else if (faceInfo.flipped === "both") {
                    [uvCoords[0], uvCoords[2]] = [uvCoords[2], uvCoords[0]];
                    [uvCoords[1], uvCoords[3]] = [uvCoords[3], uvCoords[1]];
                }

                if (faceInfo.rotated === 90) {
                    let centerX = (uvCoords[0] + uvCoords[2]) / 2;
                    let centerY = (uvCoords[1] + uvCoords[3]) / 2;
                    let halfWidth = Math.abs(uvCoords[2] - uvCoords[0]) / 2;
                    let halfHeight = Math.abs(uvCoords[3] - uvCoords[1]) / 2;

                    uvCoords = [
                        centerX - halfHeight,
                        centerY - halfWidth,
                        centerX + halfHeight,
                        centerY + halfWidth,
                    ];
                } else if (faceInfo.rotated === 270) {
                    let centerX = (uvCoords[0] + uvCoords[2]) / 2;
                    let centerY = (uvCoords[1] + uvCoords[3]) / 2;
                    let halfWidth = Math.abs(uvCoords[2] - uvCoords[0]) / 2;
                    let halfHeight = Math.abs(uvCoords[3] - uvCoords[1]) / 2;

                    uvCoords = [
                        centerX - halfHeight,
                        centerY - halfWidth,
                        centerX + halfHeight,
                        centerY + halfWidth,
                    ];
                    [uvCoords[0], uvCoords[2]] = [uvCoords[2], uvCoords[0]];
                    [uvCoords[1], uvCoords[3]] = [uvCoords[3], uvCoords[1]];
                }

                face.uv = uvCoords;
            });
        });

        updateTextureData(canvasSize, uvPositions, mainTexture);
    }

    // Create the new texture image
    function updateTextureData(canvasSize, uvPositions, mainTexture) {
        // Create a new canvas as the target texture
        let canvas = document.createElement("canvas");
        let ctx = canvas.getContext("2d");
        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;

        // Draw a transparent background first
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // For each face group, copy its texture data to the new position
        uvPositions.forEach((position, groupIndex) => {
            let group = position.group;
            let firstFace = group[0];

            // Only process faces with valid texture data
            if (firstFace.textureData && firstFace.textureData.data) {
                // Get the original UV and the new UV
                let originalData = firstFace.textureData;
                let origUV = originalData.original;
                const scaleW = originalData.scaleW;
                const scaleH = originalData.scaleH;

                // Get the original texture
                let srcTexture = originalData.texture;

                // Consider flipping and rotation
                let flipped = firstFace.flipped;
                let rotated = firstFace.rotated;

                // Create a temporary canvas for texture conversion
                let tempCanvas = document.createElement("canvas");
                let tempCtx = tempCanvas.getContext("2d");
                const w = Math.abs(origUV.width);
                const h = Math.abs(origUV.height);
                tempCanvas.width = w * scaleW;
                tempCanvas.height = h * scaleH;

                // Draw the original texture region on the temporary canvas
                tempCtx.drawImage(
                    srcTexture.img,
                    origUV.uvX1 * scaleW,
                    origUV.uvY1 * scaleH,
                    origUV.width * scaleW,
                    origUV.height * scaleH,
                    0,
                    0,
                    w * scaleW,
                    h * scaleH
                );

                // If flipping or rotation are needed
                if (flipped || rotated) {
                    let processedCanvas = document.createElement("canvas");
                    let processedCtx = processedCanvas.getContext("2d");
                    processedCanvas.width = tempCanvas.width;
                    processedCanvas.height = tempCanvas.height;

                    processedCtx.imageSmoothingEnabled = false;

                    processedCtx.save();

                    // Set transform origin to the center
                    processedCtx.translate(processedCanvas.width / 2, processedCanvas.height / 2);

                    // Apply rotation
                    if (rotated) {
                        processedCtx.rotate((rotated * Math.PI) / 180);
                    }

                    // Apply flipping
                    if (flipped === "horizontal") {
                        processedCtx.scale(-1, 1);
                    } else if (flipped === "vertical") {
                        processedCtx.scale(1, -1);
                    } else if (flipped === "both") {
                        processedCtx.scale(-1, -1);
                    }

                    // Draw the transformed image
                    processedCtx.drawImage(
                        tempCanvas,
                        -tempCanvas.width / 2,
                        -tempCanvas.height / 2,
                        tempCanvas.width,
                        tempCanvas.height
                    );

                    processedCtx.restore();

                    // Use the processed image
                    tempCanvas = processedCanvas;
                    tempCtx = processedCtx;
                }

                // Draw the processed texture to the new position
                ctx.imageSmoothingEnabled = false;
                // Account for padding
                const padding = position.padding || 0;
                ctx.drawImage(
                    tempCanvas,
                    0,
                    0,
                    tempCanvas.width,
                    tempCanvas.height,
                    position.x + padding,
                    position.y + padding,
                    position.width - padding * 2,
                    position.height - padding * 2
                );
            }
        });

        // Update the original texture
        let dataURL = canvas.toDataURL("image/png");

        // Create a new texture image object
        let img = new Image();
        img.onload = function () {
            // Update the texture
            mainTexture.fromDataURL(dataURL);

            // Refresh the canvas display
            Canvas.updateAllUVs();
            Canvas.updateVisibility();
            Canvas.updateView({ textures: [mainTexture] });

            // Notify that the texture has changed
            Blockbench.dispatchEvent('update_texture', { texture: mainTexture });
        };
        img.src = dataURL;
    }

    class RectanglePacker {
        constructor(width, height) {
            // Initialize container width and height
            this.binWidth = width;
            this.binHeight = height;

            // List of placed rectangles
            this.placedRectangles = [];

            // List of available spaces (initially one large rectangle representing the whole container)
            this.freeRectangles = [
                { x: 0, y: 0, width, height }
            ];
        }

        /**
         * Place a rectangle
         * @param {number} width - Rectangle width
         * @param {number} height - Rectangle height
         * @param {string} method - Placement strategy: 'best-area', 'best-short-side', 'best-long-side', 'bottom-left'
         * @returns {Object|null} - Placement position, returns null on failure
         */
        insert(width, height, method = 'bottom-left') {
            // Check if the rectangle can fit in the container
            if (width > this.binWidth || height > this.binHeight) {
                return null;
            }

            let bestScore = Infinity;
            let bestRectIndex = -1;
            let bestX = 0;
            let bestY = 0;

            // Try each available space
            for (let i = 0; i < this.freeRectangles.length; i++) {
                const freeRect = this.freeRectangles[i];

                // Check if the rectangle can fit into the current space
                if (freeRect.width >= width && freeRect.height >= height) {
                    let score;

                    // Calculate score based on strategy
                    switch (method) {
                        case 'best-area': //best area fit
                            score = freeRect.width * freeRect.height - width * height;
                            break;
                        case 'best-short-side': //best short side fit
                            score = Math.min(freeRect.width - width, freeRect.height - height);
                            break;
                        case 'best-long-side': //best long side fit
                            score = Math.max(freeRect.width - width, freeRect.height - height);
                            break;
                        case 'bottom-left': //bottom left first
                            score = freeRect.y * 10000 + freeRect.x;
                            break;
                        default:
                            score = freeRect.width * freeRect.height - width * height;
                    }

                    if (score < bestScore) {
                        bestScore = score;
                        bestRectIndex = i;
                        bestX = freeRect.x;
                        bestY = freeRect.y;
                    }
                }
            }

            // If no suitable space is found
            if (bestRectIndex === -1) {
                return null;
            }

            // Place the rectangle at the best position
            const placedRect = { x: bestX, y: bestY, width, height };
            this.placedRectangles.push(placedRect);

            // Split the occupied space to create new free space
            this.splitFreeRectangle(bestRectIndex, placedRect);

            // Merge overlapping free spaces
            this.pruneFreeRectangles();

            return placedRect;
        }

        /**
         * Split free rectangle - fix overlap issues
         * @param {number} freeRectIndex - Index of the free rectangle to split
         * @param {Object} placedRect - The placed rectangle
         */
        splitFreeRectangle(freeRectIndex, placedRect) {
            // Get the free rectangle being split
            const freeRect = this.freeRectangles[freeRectIndex];

            // Record the right and bottom of the original free rectangle
            const freeRectRight = freeRect.x + freeRect.width;
            const freeRectBottom = freeRect.y + freeRect.height;

            // Record the right and bottom of the placed rectangle
            const placedRectRight = placedRect.x + placedRect.width;
            const placedRectBottom = placedRect.y + placedRect.height;

            // Remove the free rectangle that will be split
            this.freeRectangles.splice(freeRectIndex, 1);

            // Try to create a free area on the right (non-overlapping)
            if (placedRectRight < freeRectRight) {
                this.freeRectangles.push({
                    x: placedRectRight,
                    y: freeRect.y,
                    width: freeRectRight - placedRectRight,
                    height: freeRect.height
                });
            }

            // Try to create a free area at the bottom (non-overlapping)
            if (placedRectBottom < freeRectBottom) {
                this.freeRectangles.push({
                    x: freeRect.x,
                    y: placedRectBottom,
                    width: freeRect.width,
                    height: freeRectBottom - placedRectBottom
                });
            }

            // Try to create a free area on the left (not overlapping the placed rectangle)
            if (placedRect.x > freeRect.x) {
                this.freeRectangles.push({
                    x: freeRect.x,
                    y: freeRect.y,
                    width: placedRect.x - freeRect.x,
                    height: freeRect.height
                });
            }

            // Try to create a free area on the top (not overlapping the placed rectangle)
            if (placedRect.y > freeRect.y) {
                this.freeRectangles.push({
                    x: freeRect.x,
                    y: freeRect.y,
                    width: freeRect.width,
                    height: placedRect.y - freeRect.y
                });
            }
        }

        /**
         * Merge overlapping free rectangles
         */
        pruneFreeRectangles() {
            // Remove rectangles that are completely contained
            for (let i = 0; i < this.freeRectangles.length; i++) {
                for (let j = i + 1; j < this.freeRectangles.length; j++) {
                    if (j >= this.freeRectangles.length) break;

                    if (this.isContainedIn(this.freeRectangles[i], this.freeRectangles[j])) {
                        this.freeRectangles.splice(i, 1);
                        i--;
                        break;
                    }

                    if (this.isContainedIn(this.freeRectangles[j], this.freeRectangles[i])) {
                        this.freeRectangles.splice(j, 1);
                        j--;
                    }
                }
            }

            // Check if placed rectangles overlap with the free areas and split them further if needed
            for (let i = 0; i < this.freeRectangles.length; i++) {
                const freeRect = this.freeRectangles[i];

                for (const placedRect of this.placedRectangles) {
                    // Check for overlap
                    if (this.isOverlapping(freeRect, placedRect)) {
                        // Split the current free rectangle into non-overlapping parts
                        const newRects = this.splitByPlacedRect(freeRect, placedRect);

                        // Remove the current free rectangle
                        this.freeRectangles.splice(i, 1);
                        i--;

                        // Add new non-overlapping free rectangles
                        this.freeRectangles.push(...newRects);
                        break;
                    }
                }
            }
        }

        /**
         * Split the free rectangle into parts that do not overlap the placed rectangle
         */
        splitByPlacedRect(freeRect, placedRect) {
            const result = [];

            // Get the boundaries of the overlapping region
            const overlapLeft = Math.max(freeRect.x, placedRect.x);
            const overlapTop = Math.max(freeRect.y, placedRect.y);
            const overlapRight = Math.min(freeRect.x + freeRect.width, placedRect.x + placedRect.width);
            const overlapBottom = Math.min(freeRect.y + freeRect.height, placedRect.y + placedRect.height);

            // Top area
            if (freeRect.y < placedRect.y) {
                result.push({
                    x: freeRect.x,
                    y: freeRect.y,
                    width: freeRect.width,
                    height: placedRect.y - freeRect.y
                });
            }

            // Bottom area
            if ((freeRect.y + freeRect.height) > (placedRect.y + placedRect.height)) {
                result.push({
                    x: freeRect.x,
                    y: placedRect.y + placedRect.height,
                    width: freeRect.width,
                    height: (freeRect.y + freeRect.height) - (placedRect.y + placedRect.height)
                });
            }

            // Left area
            if (freeRect.x < placedRect.x) {
                result.push({
                    x: freeRect.x,
                    y: overlapTop,
                    width: placedRect.x - freeRect.x,
                    height: overlapBottom - overlapTop
                });
            }

            // Right area
            if ((freeRect.x + freeRect.width) > (placedRect.x + placedRect.width)) {
                result.push({
                    x: placedRect.x + placedRect.width,
                    y: overlapTop,
                    width: (freeRect.x + freeRect.width) - (placedRect.x + placedRect.width),
                    height: overlapBottom - overlapTop
                });
            }

            return result;
        }

        /**
         * Check if two rectangles overlap
         */
        isOverlapping(rectA, rectB) {
            return !(
                rectA.x + rectA.width <= rectB.x ||
                rectB.x + rectB.width <= rectA.x ||
                rectA.y + rectA.height <= rectB.y ||
                rectB.y + rectB.height <= rectA.y
            );
        }

        /**
         * Check if rectangle A is completely inside rectangle B
         */
        isContainedIn(rectA, rectB) {
            return rectA.x >= rectB.x && rectA.y >= rectB.y &&
                rectA.x + rectA.width <= rectB.x + rectB.width &&
                rectA.y + rectA.height <= rectB.y + rectB.height;
        }

        /**
         * Get the placed rectangles
         */
        getPlacedRectangles() {
            return this.placedRectangles;
        }

        /**
         * Get the remaining free spaces
         */
        getFreeRectangles() {
            return this.freeRectangles;
        }

        /**
         * Get the occupancy rate
         */
        getOccupancyRate() {
            const totalArea = this.binWidth * this.binHeight;
            const usedArea = this.placedRectangles.reduce((sum, rect) => {
                return sum + (rect.width * rect.height);
            }, 0);

            return usedArea / totalArea;
        }

        /**
         * Reset the packer
         */
        reset() {
            this.placedRectangles = [];
            this.freeRectangles = [
                { x: 0, y: 0, width: this.binWidth, height: this.binHeight }
            ];
        }

        /**
         * Check whether placed rectangles overlap
         * @returns {boolean} Returns true if there is overlap, otherwise false
         */
        hasOverlappingRectangles() {
            for (let i = 0; i < this.placedRectangles.length; i++) {
                for (let j = i + 1; j < this.placedRectangles.length; j++) {
                    if (this.isOverlapping(this.placedRectangles[i], this.placedRectangles[j])) {
                        return true;
                    }
                }
            }
            return false;
        }
    }

    // Register plugin
    Plugin.register(id, plugin);
})();