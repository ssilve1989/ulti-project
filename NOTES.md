# Modifications Required to Google Sheet

- Remove data validation rule on prog point column
- add World column after IGN. This is necessary to update rows by finding the unique combination of IGN and World.
   - make sure to add this to prog sheet as well 
- Move Early prog to a different sheet. Makes appending rows more complicated than it needs to be
  - This currently is not doing anything to guarantee uniqueness of character names
- NEED GUILD ID FROM SAUS FOR DEPLOY SECRET

## Possible issues

Both the development and production bot are listening to reactions in all discords they are apart of, but each discord might have different settings configured.

It ends up searching in the wrong database for an associated signup.
