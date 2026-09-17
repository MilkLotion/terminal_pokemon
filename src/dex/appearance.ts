// 저장의 모습과 색을 그림 캐시 키로 변환
export const appearanceOf = (pet: { species: string; look?: string; shiny: boolean }): string => `${pet.look ?? pet.species}${pet.shiny ? ":shiny" : ""}`;
