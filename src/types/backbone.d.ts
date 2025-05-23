declare module 'backbone' {
    export interface Events {
        on(event: string, callback: Function, context?: any): this;
        off(event?: string, callback?: Function, context?: any): this;
        trigger(event: string, ...args: any[]): this;
        listenTo(other: any, event: string, callback: Function): this;
        stopListening(other?: any, event?: string, callback?: Function): this;
    }

    export const Events: Events;
} 