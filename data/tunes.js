/*
 * The tune shelf, as data. One line = one tune, in shelf order (line 1 is Tune 1).
 *
 *   Title | meter | bpm | music
 *
 * music: bars separated by "/", notes separated by spaces.
 *   1-7      scale degree (1 = Sa)         0   rest
 *   5'       one octave up                 ,5  one octave down
 *   b3  #4   flat / sharp degree
 *   :2       lasts 2 beats (default 1)     :.5 half a beat    :1.5 dotted
 *
 * A line with only a title is a placeholder card on the shelf.
 * To add a tune, replace its placeholder with a full line. No code changes.
 */
window.DHUN_TUNES_TEXT = String.raw`
Jingle Bells
Happy Birthday | 3/4 | 100 | 5:.75 5:.25 / 6 5 1' / 7:2 5:.75 5:.25 / 6 5 2' / 1':2 5:.75 5:.25 / 5' 3' 1' / 7 6 4':.75 4':.25 / 3' 1' 2' / 1':3
Twinkle Twinkle Little Star | 4/4 | 100 | 1 1 5 5 / 6 6 5:2 / 4 4 3 3 / 2 2 1:2 / 5 5 4 4 / 3 3 2:2 / 5 5 4 4 / 3 3 2:2 / 1 1 5 5 / 6 6 5:2 / 4 4 3 3 / 2 2 1:2
Somewhere Over the Rainbow
Ode to Joy | 4/4 | 108 | 3 3 4 5 / 5 4 3 2 / 1 1 2 3 / 3:1.5 2:.5 2:2 / 3 3 4 5 / 5 4 3 2 / 1 1 2 3 / 2:1.5 1:.5 1:2 / 2 2 3 1 / 2 3:.5 4:.5 3 1 / 2 3:.5 4:.5 3 2 / 1 2 ,5:2 / 3 3 4 5 / 5 4 3 2 / 1 1 2 3 / 2:1.5 1:.5 1:2
Frère Jacques
Morning Has Broken
Amazing Grace
When the Saints Go Marching In
Michael Row the Boat Ashore
Mary Had a Little Lamb
Hot Cross Buns
London Bridge
Row Row Row Your Boat
Old MacDonald
Silent Night
Joy to the World
Deck the Halls
We Wish You a Merry Christmas
Auld Lang Syne
Brahms' Lullaby
Minuet in G
Oh My Darling, Clementine
She'll Be Coming Round the Mountain
Red River Valley
Camptown Races
Go Tell Aunt Rhody
Wayfaring Stranger
Nobody Knows the Trouble I've Seen
Come Thou Fount of Every Blessing
Hark! The Herald Angels Sing
Away in a Manger
Shalom Chaverim
Alouette
Waltzing Matilda
Baa Baa Black Sheep
Itsy Bitsy Spider
Hickory Dickory Dock
Pop Goes the Weasel
Swing Low, Sweet Chariot
Kumbaya
Bella Ciao
Korobeiniki, the Pedlar's Song
Greensleeves
Scarborough Fair
Drunken Sailor
Go Down Moses
We Three Kings
Hava Nagila
In the Hall of the Mountain King
Für Elise
The Lion Sleeps Tonight
`;
