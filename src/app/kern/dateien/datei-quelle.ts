/** Die Teile einer vom Menschen gewählten Datei, die ein Leser braucht (erleichtert Tests). */
export type DateiQuelle = Pick<File, 'name' | 'text' | 'arrayBuffer'>;
