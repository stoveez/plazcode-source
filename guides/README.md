# PlazCode guides (Documentation)

Each folder here is one guide or troubleshooting article. Everyone using PlazCode sees them
in the app under **Documentation**, once they are posted. Only the repo owner can post.

## Add or change a guide
1. Make a folder named with lowercase words and dashes, for example `my-new-guide/`.
2. Put a `guide.md` inside, starting with this block:

   ```
   ---
   title: My new guide
   summary: One or two sentences shown on the card.
   category: guides            (or: troubleshooting)
   icon: rocket                (download user plug rocket brain palette refresh cube eye warning bug book bolt folder terminal wrench shield question link heart)
   gradient: sky               (violet lime sky orange rose teal mint sunset)
   order: 7                    (position in its list)
   date: 2026-10-21
   ---
   ```
3. Write the guide below it. You can use `## Headings`, `- bullets`, `1. steps`, `**bold**`, `*italic*`,
   `` `code` ``, `> note boxes`, and links `[text](https://...)`. To link to another guide, use its folder name: `[text](other-guide)`.
4. For a picture, copy the image (png, jpg, gif or webp, under 3 MB) into the same folder and write `![what it shows](picture.png)`.

## Check it
`python3 guides/test_guides.py`

## Post it (only when you say so)
Run the **Publish guides to the public repo** workflow in GitHub Actions.
Choose `test` first (a throwaway repo), look at it, then `real`. It only ever changes the public repo's `guides/` folder.
The app shows new guides the next time Documentation is opened.
