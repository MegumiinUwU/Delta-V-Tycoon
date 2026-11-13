// Idea Lab: prototypes that try ideas from player and community feedback. #/lab is the crew cabin (the hub);
// #/lab/<id> opens one prototype. Kept in src/lab so the game screens and the core contract stay as they are.
import { Cabin } from './Cabin';
import { Poem } from './Poem';
import { Stories } from './Stories';

export function Lab({ id }: { id?: string }) {
  switch (id) {
    case 'poem': return <Poem />;
    case 'stories': return <Stories />;
    default: return <Cabin />;
  }
}
