'use client';

import {ApolloProvider as ApolloProviderBase} from '@apollo/client/react';
import client from './apollo-client';
import React from 'react';
export default function ApolloProvider({
                                           children,
                                       }:  {
    children: React.ReactNode;
}) {
    return <ApolloProviderBase client={client}>{children}</ApolloProviderBase>;
}