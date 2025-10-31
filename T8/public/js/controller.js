/*
 * controller.js
 *
 * CSC309 Tutorial 8
 * 
 * Complete me
 */

let hasNext = true;
let nextParagraphNumber = 1;

const data = document.getElementById("data");
data.innerHTML = "";


function renderParagraph(p) {
    //Wrap each element with <div>
    const div = document.createElement("div");
    const number = p.id;
    div.id = `paragraph_${number}`;

    // Add <p> at the end of each paragraph
    const p_Element = document.createElement("p");
    p_Element.innerHTML = `${p.content} <b>(Paragraph: ${p.id})</b>`

    //Create like button
    const button = document.createElement("button");
    button.classList.add("btn", "like");
    button.textContent = `Likes: ${p.likes}`;
    button.addEventListener("click", async() => {
        const likeResponse = await fetch(`/text/like`, {
            method: 'Post',
            headers: {"Content-Type" : "application/json"},
            body: JSON.stringify({paragraph: p.id}),
        });
        const result = await likeResponse.json();
        button.textContent = `Likes: ${result.data.likes}`;
    });

    div.appendChild(p_Element);
    div.appendChild(button);
    data.appendChild(div);
}

async function fetchParagraphs() {
    if (!hasNext) return;

    const paraResponse = await fetch(`/text?paragraph=${nextParagraphNumber}`);
    const result = await paraResponse.json();

    result.data.forEach(renderParagraph);
    nextParagraphNumber += result.data.length;
    hasNext = result.next;

    if(!hasNext) {
        const end = document.createElement("p");
        end.innerHTML = "<b>You have reached the end</b>";
        data.appendChild(end);
    }
}

window.addEventListener("scroll", () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 10 && hasNext) {
        fetchParagraphs();
    }
});

window.addEventListener('DOMContentLoaded', ()=>{
    fetchParagraphs();
});
